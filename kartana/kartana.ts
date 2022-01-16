namespace kartana{
    enum KeyCode{
        TAB = 9,
        RETURN = 13,
        ESC = 27,
        UP = 38,
        DOWN = 40
    }
    export enum AddressFieldType {
        postcode = 'postcode',
        municipality = 'municipality',
        street = 'street',
        housenumber ='houseNumber'
    }
    export interface AddressSchema{
        [AddressFieldType.postcode]?: string,
        [AddressFieldType.municipality]?: string,
        [AddressFieldType.street]?: string,
        [AddressFieldType.housenumber]?: string,
    }
    export interface CompletionRequest{
        version: '1.0'
        complete: AddressFieldType;
        address?: AddressSchema;
    }
    export interface CompletionResponse{
        suggestions: AddressSchema[]
    }
    export type CompletionCallback = (response: CompletionResponse) => void;
    class Throttler {
        private lastCall: number;
        private timeoutId: number;
        private readonly minDelay: number;
        private readonly maxDelay: number;
        private callNow(callback, ...args){
            this.lastCall = Date.now();
            callback(...args);
        }
        constructor(minDelay: number, maxDelay: number){
            this.minDelay = minDelay;
            this.maxDelay = maxDelay;
        }
        callLater(callback, ...args){
            let delay = 0;
            if(this.lastCall !== undefined){
                let timeSinceLastCall = Date.now() - this.lastCall;
                delay = Math.max(this.minDelay, this.maxDelay - timeSinceLastCall);
            }
            clearTimeout (this.timeoutId);
            this.timeoutId = setTimeout(this.callNow, delay, callback, ...args);
        }
    }
    class API {
        private endpoint: string;
        private throttler: Throttler;
        private static cache: {[key: string]: CompletionResponse} = {};
        private static _singleton: API;
        private constructor(endpoint: string, minDelay: number, maxDelay: number) {
            this.endpoint = endpoint;
            this.throttler = new Throttler(minDelay, maxDelay);
        }
        private static get singleton(): API{
            if(API._singleton === undefined){
                API._singleton = new API("https://api.kartana.de/public/autocomplete", 200, 500);
            }
            return API._singleton
        }
        private static call(callback: CallableFunction, request: CompletionRequest) {
            fetch(API.singleton.endpoint, {
                method: 'POST',
                mode: 'cors',
                cache: 'default',
                credentials: 'omit',
                headers: {'Content-Type': 'application/json'},
                redirect: 'follow',
                referrerPolicy: 'origin',
                body: JSON.stringify(request)
            }).then(
                response => response.json()
            ).then(
                result => callback(result)
            );
        }
        private static cacheKey(request: CompletionRequest): string{
            let normalizedAddress = {};
            Object.keys(request.address).forEach(key => {
                let value: string = request.address[key];
                value = value.toLowerCase();
                value = value.replace(/[^a-z0-9]/,'')
                if(value.length > 0){
                    normalizedAddress[key] = value;
                }
            })
            let normalizedRequest = {
                complete: request.complete,
                address: normalizedAddress
            }
            return JSON.stringify(normalizedRequest);
        }
        static complete(callback: CompletionCallback, request: CompletionRequest){
            let cacheKey = API.cacheKey(request);
            if(cacheKey in API.cache){
                let cachedResponse = API.cache[cacheKey];
                callback(cachedResponse);
                return;
            }
            API.singleton.throttler.callLater(API.call, response => {
                API.cache[cacheKey] = response;
                callback(response);
            }, request)
        }
    }
    class Address {
        id: string;
        private [AddressFieldType.postcode]: AddressField;
        private [AddressFieldType.municipality]: AddressField;
        private [AddressFieldType.street]: AddressField;
        private [AddressFieldType.housenumber]: AddressField;
        static register: {[id: string]: Address} = {}
        constructor(id){
            this.id = id
        }
        static lookup(id: string, createIfNotExists: boolean = false): Address{
            if(createIfNotExists && !(id in Address.register)){
                Address.register[id] = new Address(id);
            }
            return Address.register[id]
        }
        set value(address: AddressSchema){
            for (let field in AddressFieldType) {
                if(this[field] !== undefined && address[field] !== undefined){
                   this[field].value = address[field];
                }
            }
        }
        get value(){
            let address = {}
            for (let field in AddressFieldType) {
                if(this[field] !== undefined){
                    address[field] = this[field].value;
                }
            }
            return address
        }
        registerField(field: AddressField){
            if(this[field.fieldType] === undefined){
                this[field.fieldType] = field
            }else{
                throw `Address field of type ${field.fieldType} is already registered for address '${this.id}'`
            }
        }
    }
    class AddressField {
        readonly fieldType: AddressFieldType;
        readonly address: Address;
        readonly element: HTMLInputElement;
        private readonly combobox: Combobox;
        private _isFocused: boolean = false;
        constructor(element: HTMLInputElement, combobox: Combobox) {
            this.combobox = combobox;
            this.element = element;
            this.element.classList.add('input');
            this.element.setAttribute('autocomplete','off');
            this.element.addEventListener('focus', this.onFocus.bind(this))
            this.element.addEventListener('blur', this.onBlur.bind(this))

            this.fieldType = AddressFieldType[this.element.getAttribute('data-kartana-field')];
            let addressId = this.element.getAttribute('data-kartana-address');
            this.address = Address.lookup(addressId,true);
            this.address.registerField(this);

            this.element.addEventListener('input', this.onInput.bind(this));
        }
        triggerSuggestions (){
            this.combobox.suggestionBox.requestSuggestions();
        }
        onInput(){
            this.triggerSuggestions()
        }
        get isFocused(){
            return this._isFocused;
        }
        onFocus(event){
            this._isFocused = true;
            this.triggerSuggestions();
        }
        onBlur(event){
            this._isFocused = false;
        }
        get value(){
            return this.element.value;
        }
        set value(value: string){
            this.element.value = value;
        }
    }
    class SuggestionBox{
        readonly element: HTMLUListElement;
        readonly combobox: Combobox;
        private options: Option[] = [];
        private highlightedOptionIndex: number;
        constructor(combobox: Combobox) {
            this.element = document.createElement('ul');
            this.element.classList.add('menu');
            this.element.tabIndex = -1; // skipp in tab order
            this.combobox = combobox;
            document.addEventListener('keydown', this.handleKeyDown.bind(this));
        }
        get highlightedOption(){
            return this.options[this.highlightedOptionIndex];
        }
        requestSuggestions(){
            API.complete(this.handleSuggestions.bind(this), {
                version: '1.0',
                complete: this.combobox.addressField.fieldType,
                address: this.combobox.addressField.address.value
            })
        }
        handleSuggestions(response: CompletionResponse){
            this.setOptions(response.suggestions);
        }
        reset(){
            this.options = []
            this.element.innerHTML = '';
            this.highlightedOptionIndex = undefined;
        }
        setOptions(addresses: AddressSchema[]){
            this.reset();
            addresses.forEach((address, index) => {
                let option = new Option(this, index, address);
                this.options.push(option)
                this.element.appendChild(option.element)
            })
            if(this.options.length > 0){
                this.highlightOption(0);
                let acknowledgement = new Acknowledgement()
                this.element.appendChild(acknowledgement.element)
            }
        }
        handleKeyDown(event){
            if(!this.combobox.isFocused){
                return;
            }
            let terminateEvent = false;
            if(event.keyCode === KeyCode.DOWN){
                this.highlightNextOption();
                terminateEvent = true;
            }else if(event.keyCode === KeyCode.UP){
                this.highlightPreviousOption();
                terminateEvent = true;
            }else if(event.keyCode == KeyCode.RETURN){
                this.selectOption(this.highlightedOption);
                terminateEvent = true;
            }else if(event.keyCode == KeyCode.TAB){
                if(this.highlightedOptionIndex !== undefined){
                    this.selectOption(this.highlightedOption);
                }
            }else if(event.keyCode == KeyCode.ESC){
                if(this.highlightedOptionIndex !== undefined){
                    this.combobox.addressField.value = '';
                    this.reset();
                }
            }
            if(terminateEvent){
                event.preventDefault();
                event.stopPropagation();
            }

        }
        highlightOption(index){
            if(this.highlightedOptionIndex !== undefined) {
                this.options[this.highlightedOptionIndex].unhighlight()
            }
            this.highlightedOptionIndex = index;
            this.options[this.highlightedOptionIndex].highlight();
        }
        highlightNextOption(){
            if(this.highlightedOptionIndex < this.options.length - 1){
                this.highlightOption(this.highlightedOptionIndex + 1)
            }
        }
        highlightPreviousOption(){
            if(this.highlightedOptionIndex > 0){
                this.highlightOption(this.highlightedOptionIndex - 1)
            }
        }
        selectOption(option){
            this.highlightOption(option.index)
            this.combobox.addressField.address.value = option.address;
        }
    }
    class Acknowledgement{
        readonly element: HTMLDivElement;
        constructor() {
            this.element = document.createElement('div');
            this.element.classList.add('acknowledgement');
            this.element.innerHTML = `powered by <a href="https://kartana.de" title="Autovervollständigung für Adressformulare">kartana</a>`
        }
    }
    class Option{
        readonly element: HTMLLIElement;
        readonly address: AddressSchema;
        readonly index;
        private readonly suggestionBox: SuggestionBox;
        constructor(suggestionBox: SuggestionBox, index: number, address: AddressSchema) {
            this.address = address;
            this.suggestionBox = suggestionBox;
            this.element = this.createElement();
            this.element.classList.add('option');
            this.index = index;
            this.element.addEventListener('click', this.onClick.bind(this));
        }
        get matchesContext(){
            let fieldType = this.suggestionBox.combobox.addressField.fieldType;
            let context = this.suggestionBox.combobox.addressField.address.value;
            return (
                fieldType == AddressFieldType.postcode
                && this.address[AddressFieldType.municipality].indexOf(context[AddressFieldType.municipality]) === 0
            ) || (
                fieldType == AddressFieldType.municipality
                && this.address[AddressFieldType.postcode].indexOf(context[AddressFieldType.postcode]) === 0
            ) || (
                fieldType == AddressFieldType.street
                && this.address[AddressFieldType.postcode].indexOf(context[AddressFieldType.postcode]) === 0
                && this.address[AddressFieldType.municipality].indexOf(context[AddressFieldType.municipality]) === 0
            );
        }
        createElement():  HTMLLIElement{
            let element = document.createElement('li');
            let contextMatchClass = this.matchesContext? 'context-match' : 'no-context-match';
            element.classList.add(contextMatchClass);

            let value, context;
            let fieldType = this.suggestionBox.combobox.addressField.fieldType;
            switch (fieldType){
                case AddressFieldType.postcode:
                    value = this.address[AddressFieldType.postcode]
                    context = this.address[AddressFieldType.municipality]
                    element.innerHTML = `<span class="value">${value}</span> <span class="context">${context}</span>`;
                    break;
                case AddressFieldType.municipality:
                    value = this.address[AddressFieldType.municipality]
                    context = this.address[AddressFieldType.postcode]
                    element.innerHTML = `<span class="context">${context}</span> <span class="value">${value}</span>`;
                    break;
                case AddressFieldType.street:
                    value = this.address[AddressFieldType.street]
                    context = `${this.address[AddressFieldType.postcode]} ${this.address[AddressFieldType.municipality]}`
                    element.innerHTML = `<span class="value">${value}</span><br /><span class="context">${context}</span>`;
                    break;
            }
            return element;
        }
        get isHighlighted(){
            return this.element.classList.contains('highlighted');
        }
        highlight(){
            if(!this.isHighlighted){
                this.element.classList.add('highlighted');
                this.suggestionBox.element.scrollTop = this.element.offsetTop - this.suggestionBox.element.offsetHeight + this.element.offsetHeight;
            }
        }
        unhighlight(){
            if(this.isHighlighted){
                this.element.classList.remove('highlighted')
            }
        }
        onClick(event){
            this.suggestionBox.selectOption(this);
        }
    }
    export class Combobox{
        readonly element: HTMLDivElement;
        readonly addressField: AddressField;
        readonly suggestionBox: SuggestionBox;
        constructor(inputElement: HTMLInputElement) {
            // container
            this.element = document.createElement('div');
            this.element.classList.add('kartana');
            this.element.classList.add('combobox');
            inputElement.insertAdjacentElement('beforebegin', this.element);
            // address field
            this.element.appendChild(inputElement);
            this.addressField = new AddressField(inputElement, this);
            // list box
            this.suggestionBox = new SuggestionBox(this);
            this.element.appendChild(this.suggestionBox.element);
        }
        get isFocused(){
            return this.addressField.isFocused;
        }
        set value(value: string){
            this.addressField.value = value;
        }
    }
    export function init(){
        document.querySelectorAll('input[data-kartana-field]').forEach(
            (e: HTMLInputElement) =>new Combobox(e)
        )
    }
}
window.addEventListener('load', kartana.init);