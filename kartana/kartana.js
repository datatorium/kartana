var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
var kartana;
(function (kartana) {
    var KeyCode;
    (function (KeyCode) {
        KeyCode[KeyCode["TAB"] = 9] = "TAB";
        KeyCode[KeyCode["RETURN"] = 13] = "RETURN";
        KeyCode[KeyCode["ESC"] = 27] = "ESC";
        KeyCode[KeyCode["UP"] = 38] = "UP";
        KeyCode[KeyCode["DOWN"] = 40] = "DOWN";
    })(KeyCode || (KeyCode = {}));
    var AddressFieldType;
    (function (AddressFieldType) {
        AddressFieldType["postcode"] = "postcode";
        AddressFieldType["municipality"] = "municipality";
        AddressFieldType["street"] = "street";
    })(AddressFieldType = kartana.AddressFieldType || (kartana.AddressFieldType = {}));
    var Throttler = /** @class */ (function () {
        function Throttler(minDelay, maxDelay) {
            this.minDelay = minDelay;
            this.maxDelay = maxDelay;
        }
        Throttler.prototype.callNow = function (callback) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            this.lastCall = Date.now();
            callback.apply(void 0, args);
        };
        Throttler.prototype.callLater = function (callback) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var delay = 0;
            if (this.lastCall !== undefined) {
                var timeSinceLastCall = Date.now() - this.lastCall;
                delay = Math.max(this.minDelay, this.maxDelay - timeSinceLastCall);
            }
            clearTimeout(this.timeoutId);
            this.timeoutId = setTimeout.apply(void 0, __spreadArray([this.callNow, delay, callback], args));
        };
        return Throttler;
    }());
    var API = /** @class */ (function () {
        function API(endpoint, minDelay, maxDelay) {
            this.endpoint = endpoint;
            this.throttler = new Throttler(minDelay, maxDelay);
        }
        Object.defineProperty(API, "singleton", {
            get: function () {
                if (API._singleton === undefined) {
                    /* Please do not lower the minimum request delay. It is optimised for the best user experience without
                    putting unnecessary load on the API server. Thank you :) */
                    API._singleton = new API("https://api.kartana.de/public/autocomplete", 200, 500);
                }
                return API._singleton;
            },
            enumerable: false,
            configurable: true
        });
        API.call = function (callback, request) {
            fetch(API.singleton.endpoint, {
                method: 'POST',
                mode: 'cors',
                cache: 'default',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json' },
                redirect: 'follow',
                referrerPolicy: 'origin',
                body: JSON.stringify(request)
            }).then(function (response) { return response.json(); }).then(function (result) { return callback(result); });
        };
        API.cacheKey = function (request) {
            var normalizedAddress = {};
            Object.keys(request.address).forEach(function (key) {
                var value = request.address[key];
                value = value.toLowerCase();
                value = value.replace(/[^a-z0-9]/, '');
                if (value.length > 0) {
                    normalizedAddress[key] = value;
                }
            });
            var normalizedRequest = {
                complete: request.complete,
                address: normalizedAddress
            };
            return JSON.stringify(normalizedRequest);
        };
        API.complete = function (callback, request) {
            var cacheKey = API.cacheKey(request);
            if (cacheKey in API.cache) {
                var cachedResponse = API.cache[cacheKey];
                callback(cachedResponse);
                return;
            }
            API.singleton.throttler.callLater(API.call, function (response) {
                API.cache[cacheKey] = response;
                callback(response);
            }, request);
        };
        API.cache = {};
        return API;
    }());
    var Address = /** @class */ (function () {
        function Address(id) {
            this.id = id;
        }
        Address.lookup = function (id, createIfNotExists) {
            if (createIfNotExists === void 0) { createIfNotExists = false; }
            if (createIfNotExists && !(id in Address.register)) {
                Address.register[id] = new Address(id);
            }
            return Address.register[id];
        };
        Object.defineProperty(Address.prototype, "value", {
            get: function () {
                var address = {};
                for (var field in AddressFieldType) {
                    if (this[field] !== undefined) {
                        address[field] = this[field].value;
                    }
                }
                return address;
            },
            set: function (address) {
                for (var field in AddressFieldType) {
                    if (this[field] !== undefined && address[field] !== undefined) {
                        this[field].value = address[field];
                    }
                }
            },
            enumerable: false,
            configurable: true
        });
        Address.prototype.registerField = function (field) {
            if (this[field.fieldType] === undefined) {
                this[field.fieldType] = field;
            }
            else {
                throw "Address field of type " + field.fieldType + " is already registered for address '" + this.id + "'";
            }
        };
        AddressFieldType.postcode, AddressFieldType.municipality, AddressFieldType.street;
        Address.register = {};
        return Address;
    }());
    var AddressField = /** @class */ (function () {
        function AddressField(element, combobox) {
            this._isFocused = false;
            this.combobox = combobox;
            this.element = element;
            this.element.classList.add('input');
            this.element.setAttribute('autocomplete', 'off');
            var fieldType = this.element.getAttribute('data-kartana-field');
            this.fieldType = AddressFieldType[fieldType];
            if (this.fieldType === undefined) {
                throw "Autocomplete is only supported for 'postcode', 'municipality' and 'street' (not '" + fieldType + "')";
            }
            var addressId = this.element.getAttribute('data-kartana-address');
            this.address = Address.lookup(addressId, true);
            this.address.registerField(this);
            this.element.addEventListener('focus', this.onFocus.bind(this));
            this.element.addEventListener('blur', this.onBlur.bind(this));
            this.element.addEventListener('input', this.onInput.bind(this));
        }
        AddressField.prototype.triggerSuggestions = function () {
            if (this.fieldType !== undefined) {
                this.combobox.suggestionBox.open();
                this.combobox.suggestionBox.requestSuggestions();
            }
        };
        AddressField.prototype.onInput = function () {
            this.triggerSuggestions();
        };
        Object.defineProperty(AddressField.prototype, "isFocused", {
            get: function () {
                return this._isFocused;
            },
            enumerable: false,
            configurable: true
        });
        AddressField.prototype.onFocus = function (event) {
            this._isFocused = true;
            this.triggerSuggestions();
        };
        AddressField.prototype.onBlur = function (event) {
            this._isFocused = false;
        };
        Object.defineProperty(AddressField.prototype, "value", {
            get: function () {
                return this.element.value;
            },
            set: function (value) {
                this.element.value = value;
            },
            enumerable: false,
            configurable: true
        });
        return AddressField;
    }());
    var SuggestionBox = /** @class */ (function () {
        function SuggestionBox(combobox) {
            this.isClosed = false;
            this.options = [];
            this.element = document.createElement('ul');
            this.element.classList.add('menu');
            this.element.tabIndex = -1; // skipp in tab order
            this.combobox = combobox;
            document.addEventListener('keydown', this.handleKeyDown.bind(this));
        }
        Object.defineProperty(SuggestionBox.prototype, "highlightedOption", {
            get: function () {
                return this.options[this.highlightedOptionIndex];
            },
            enumerable: false,
            configurable: true
        });
        SuggestionBox.prototype.close = function () {
            this.isClosed = true;
            this.element.classList.add('closed');
        };
        SuggestionBox.prototype.open = function () {
            this.isClosed = false;
            this.element.classList.remove('closed');
        };
        SuggestionBox.prototype.requestSuggestions = function () {
            API.complete(this.handleSuggestions.bind(this), {
                version: '1.0',
                complete: this.combobox.addressField.fieldType,
                address: this.combobox.addressField.address.value
            });
        };
        SuggestionBox.prototype.handleSuggestions = function (response) {
            this.setOptions(response.suggestions);
        };
        SuggestionBox.prototype.reset = function () {
            this.options = [];
            this.element.innerHTML = '';
            this.highlightedOptionIndex = undefined;
        };
        SuggestionBox.prototype.setOptions = function (addresses) {
            var _this = this;
            this.reset();
            addresses.forEach(function (address, index) {
                var option = new Option(_this, index, address);
                _this.options.push(option);
                _this.element.appendChild(option.element);
            });
            if (this.options.length > 0) {
                this.highlightOption(0);
                var acknowledgement = new Acknowledgement();
                this.element.appendChild(acknowledgement.element);
            }
        };
        SuggestionBox.prototype.handleKeyDown = function (event) {
            if (!this.combobox.isFocused) {
                return;
            }
            var terminateEvent = false;
            if (event.keyCode === KeyCode.DOWN) {
                this.open();
                this.highlightNextOption();
                terminateEvent = true;
            }
            else if (event.keyCode === KeyCode.UP) {
                this.open();
                this.highlightPreviousOption();
                terminateEvent = true;
            }
            else if (event.keyCode == KeyCode.RETURN) {
                if (!this.isClosed) {
                    this.selectOption(this.highlightedOption);
                }
                terminateEvent = true;
            }
            else if (event.keyCode == KeyCode.TAB) {
                if (!this.isClosed && this.highlightedOptionIndex !== undefined) {
                    this.selectOption(this.highlightedOption);
                }
            }
            else if (event.keyCode == KeyCode.ESC) {
                this.close();
            }
            if (terminateEvent) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        SuggestionBox.prototype.highlightOption = function (index) {
            if (this.highlightedOptionIndex !== undefined) {
                this.options[this.highlightedOptionIndex].unhighlight();
            }
            this.highlightedOptionIndex = index;
            this.options[this.highlightedOptionIndex].highlight();
        };
        SuggestionBox.prototype.highlightNextOption = function () {
            if (this.highlightedOptionIndex < this.options.length - 1) {
                this.highlightOption(this.highlightedOptionIndex + 1);
            }
        };
        SuggestionBox.prototype.highlightPreviousOption = function () {
            if (this.highlightedOptionIndex > 0) {
                this.highlightOption(this.highlightedOptionIndex - 1);
            }
        };
        SuggestionBox.prototype.selectOption = function (option) {
            this.highlightOption(option.index);
            this.combobox.addressField.address.value = option.address;
        };
        return SuggestionBox;
    }());
    var Acknowledgement = /** @class */ (function () {
        function Acknowledgement() {
            this.element = document.createElement('div');
            this.element.classList.add('acknowledgement');
            this.element.innerHTML = "powered by <a href=\"https://kartana.de\" title=\"Autovervollst\u00E4ndigung f\u00FCr Adressformulare\" tabindex=\"-1\">kartana</a>";
        }
        return Acknowledgement;
    }());
    var Option = /** @class */ (function () {
        function Option(suggestionBox, index, address) {
            this.address = address;
            this.suggestionBox = suggestionBox;
            this.element = this.createElement();
            this.element.classList.add('option');
            this.index = index;
            this.element.addEventListener('click', this.onClick.bind(this));
        }
        Object.defineProperty(Option.prototype, "matchesContext", {
            get: function () {
                var fieldType = this.suggestionBox.combobox.addressField.fieldType;
                var context = this.suggestionBox.combobox.addressField.address.value;
                return (fieldType == AddressFieldType.postcode
                    && this.address[AddressFieldType.municipality].indexOf(context[AddressFieldType.municipality]) === 0) || (fieldType == AddressFieldType.municipality
                    && this.address[AddressFieldType.postcode].indexOf(context[AddressFieldType.postcode]) === 0) || (fieldType == AddressFieldType.street
                    && this.address[AddressFieldType.postcode].indexOf(context[AddressFieldType.postcode]) === 0
                    && this.address[AddressFieldType.municipality].indexOf(context[AddressFieldType.municipality]) === 0);
            },
            enumerable: false,
            configurable: true
        });
        Option.prototype.createElement = function () {
            var element = document.createElement('li');
            var contextMatchClass = this.matchesContext ? 'context-match' : 'no-context-match';
            element.classList.add(contextMatchClass);
            var value, context;
            var fieldType = this.suggestionBox.combobox.addressField.fieldType;
            switch (fieldType) {
                case AddressFieldType.postcode:
                    value = this.address[AddressFieldType.postcode];
                    context = this.address[AddressFieldType.municipality];
                    element.innerHTML = "<span class=\"value\">" + value + "</span> <span class=\"context\">" + context + "</span>";
                    break;
                case AddressFieldType.municipality:
                    value = this.address[AddressFieldType.municipality];
                    context = this.address[AddressFieldType.postcode];
                    element.innerHTML = "<span class=\"context\">" + context + "</span> <span class=\"value\">" + value + "</span>";
                    break;
                case AddressFieldType.street:
                    value = this.address[AddressFieldType.street];
                    context = this.address[AddressFieldType.postcode] + " " + this.address[AddressFieldType.municipality];
                    element.innerHTML = "<span class=\"value\">" + value + "</span><br /><span class=\"context\">" + context + "</span>";
                    break;
            }
            return element;
        };
        Object.defineProperty(Option.prototype, "isHighlighted", {
            get: function () {
                return this.element.classList.contains('highlighted');
            },
            enumerable: false,
            configurable: true
        });
        Option.prototype.highlight = function () {
            if (!this.isHighlighted) {
                this.element.classList.add('highlighted');
                this.suggestionBox.element.scrollTop = this.element.offsetTop - this.suggestionBox.element.offsetHeight + this.element.offsetHeight;
            }
        };
        Option.prototype.unhighlight = function () {
            if (this.isHighlighted) {
                this.element.classList.remove('highlighted');
            }
        };
        Option.prototype.onClick = function (event) {
            this.suggestionBox.selectOption(this);
        };
        return Option;
    }());
    var Combobox = /** @class */ (function () {
        function Combobox(inputElement) {
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
        Object.defineProperty(Combobox.prototype, "isFocused", {
            get: function () {
                return this.addressField.isFocused;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Combobox.prototype, "value", {
            set: function (value) {
                this.addressField.value = value;
            },
            enumerable: false,
            configurable: true
        });
        return Combobox;
    }());
    kartana.Combobox = Combobox;
    function init() {
        document.querySelectorAll('input[data-kartana-field]').forEach(function (e) { return new Combobox(e); });
    }
    kartana.init = init;
})(kartana || (kartana = {}));
window.addEventListener('load', kartana.init);
