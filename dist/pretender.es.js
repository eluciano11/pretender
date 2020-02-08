import FakeXMLHttpRequest from 'fake-xml-http-request';
import * as FakeFetch from 'whatwg-fetch';
import RouteRecognizer from 'route-recognizer';

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

/**
 * Check if we're required to add a port number.
 *
 * @see https://url.spec.whatwg.org/#default-port
 * @param {Number|String} port Port number we need to check
 * @param {String} protocol Protocol we need to check against.
 * @returns {Boolean} Is it a default port for the given protocol
 * @api private
 */
var requiresPort = function required(port, protocol) {
  protocol = protocol.split(':')[0];
  port = +port;

  if (!port) return false;

  switch (protocol) {
    case 'http':
    case 'ws':
    return port !== 80;

    case 'https':
    case 'wss':
    return port !== 443;

    case 'ftp':
    return port !== 21;

    case 'gopher':
    return port !== 70;

    case 'file':
    return false;
  }

  return port !== 0;
};

var has = Object.prototype.hasOwnProperty
  , undef;

/**
 * Decode a URI encoded string.
 *
 * @param {String} input The URI encoded string.
 * @returns {String|Null} The decoded string.
 * @api private
 */
function decode(input) {
  try {
    return decodeURIComponent(input.replace(/\+/g, ' '));
  } catch (e) {
    return null;
  }
}

/**
 * Simple query string parser.
 *
 * @param {String} query The query string that needs to be parsed.
 * @returns {Object}
 * @api public
 */
function querystring(query) {
  var parser = /([^=?&]+)=?([^&]*)/g
    , result = {}
    , part;

  while (part = parser.exec(query)) {
    var key = decode(part[1])
      , value = decode(part[2]);

    //
    // Prevent overriding of existing properties. This ensures that build-in
    // methods like `toString` or __proto__ are not overriden by malicious
    // querystrings.
    //
    // In the case if failed decoding, we want to omit the key/value pairs
    // from the result.
    //
    if (key === null || value === null || key in result) continue;
    result[key] = value;
  }

  return result;
}

/**
 * Transform a query string to an object.
 *
 * @param {Object} obj Object that should be transformed.
 * @param {String} prefix Optional prefix.
 * @returns {String}
 * @api public
 */
function querystringify(obj, prefix) {
  prefix = prefix || '';

  var pairs = []
    , value
    , key;

  //
  // Optionally prefix with a '?' if needed
  //
  if ('string' !== typeof prefix) prefix = '?';

  for (key in obj) {
    if (has.call(obj, key)) {
      value = obj[key];

      //
      // Edge cases where we actually want to encode the value to an empty
      // string instead of the stringified value.
      //
      if (!value && (value === null || value === undef || isNaN(value))) {
        value = '';
      }

      key = encodeURIComponent(key);
      value = encodeURIComponent(value);

      //
      // If we failed to encode the strings, we should bail out as we don't
      // want to add invalid strings to the query.
      //
      if (key === null || value === null) continue;
      pairs.push(key +'='+ value);
    }
  }

  return pairs.length ? prefix + pairs.join('&') : '';
}

//
// Expose the module.
//
var stringify = querystringify;
var parse = querystring;

var querystringify_1 = {
	stringify: stringify,
	parse: parse
};

var slashes = /^[A-Za-z][A-Za-z0-9+-.]*:\/\//
  , protocolre = /^([a-z][a-z0-9.+-]*:)?(\/\/)?([\S\s]*)/i
  , whitespace = '[\\x09\\x0A\\x0B\\x0C\\x0D\\x20\\xA0\\u1680\\u180E\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200A\\u202F\\u205F\\u3000\\u2028\\u2029\\uFEFF]'
  , left = new RegExp('^'+ whitespace +'+');

/**
 * Trim a given string.
 *
 * @param {String} str String to trim.
 * @public
 */
function trimLeft(str) {
  return (str ? str : '').toString().replace(left, '');
}

/**
 * These are the parse rules for the URL parser, it informs the parser
 * about:
 *
 * 0. The char it Needs to parse, if it's a string it should be done using
 *    indexOf, RegExp using exec and NaN means set as current value.
 * 1. The property we should set when parsing this value.
 * 2. Indication if it's backwards or forward parsing, when set as number it's
 *    the value of extra chars that should be split off.
 * 3. Inherit from location if non existing in the parser.
 * 4. `toLowerCase` the resulting value.
 */
var rules = [
  ['#', 'hash'],                        // Extract from the back.
  ['?', 'query'],                       // Extract from the back.
  function sanitize(address) {          // Sanitize what is left of the address
    return address.replace('\\', '/');
  },
  ['/', 'pathname'],                    // Extract from the back.
  ['@', 'auth', 1],                     // Extract from the front.
  [NaN, 'host', undefined, 1, 1],       // Set left over value.
  [/:(\d+)$/, 'port', undefined, 1],    // RegExp the back.
  [NaN, 'hostname', undefined, 1, 1]    // Set left over.
];

/**
 * These properties should not be copied or inherited from. This is only needed
 * for all non blob URL's as a blob URL does not include a hash, only the
 * origin.
 *
 * @type {Object}
 * @private
 */
var ignore = { hash: 1, query: 1 };

/**
 * The location object differs when your code is loaded through a normal page,
 * Worker or through a worker using a blob. And with the blobble begins the
 * trouble as the location object will contain the URL of the blob, not the
 * location of the page where our code is loaded in. The actual origin is
 * encoded in the `pathname` so we can thankfully generate a good "default"
 * location from it so we can generate proper relative URL's again.
 *
 * @param {Object|String} loc Optional default location object.
 * @returns {Object} lolcation object.
 * @public
 */
function lolcation(loc) {
  var globalVar;

  if (typeof window !== 'undefined') globalVar = window;
  else if (typeof commonjsGlobal !== 'undefined') globalVar = commonjsGlobal;
  else if (typeof self !== 'undefined') globalVar = self;
  else globalVar = {};

  var location = globalVar.location || {};
  loc = loc || location;

  var finaldestination = {}
    , type = typeof loc
    , key;

  if ('blob:' === loc.protocol) {
    finaldestination = new Url(unescape(loc.pathname), {});
  } else if ('string' === type) {
    finaldestination = new Url(loc, {});
    for (key in ignore) delete finaldestination[key];
  } else if ('object' === type) {
    for (key in loc) {
      if (key in ignore) continue;
      finaldestination[key] = loc[key];
    }

    if (finaldestination.slashes === undefined) {
      finaldestination.slashes = slashes.test(loc.href);
    }
  }

  return finaldestination;
}

/**
 * @typedef ProtocolExtract
 * @type Object
 * @property {String} protocol Protocol matched in the URL, in lowercase.
 * @property {Boolean} slashes `true` if protocol is followed by "//", else `false`.
 * @property {String} rest Rest of the URL that is not part of the protocol.
 */

/**
 * Extract protocol information from a URL with/without double slash ("//").
 *
 * @param {String} address URL we want to extract from.
 * @return {ProtocolExtract} Extracted information.
 * @private
 */
function extractProtocol(address) {
  address = trimLeft(address);
  var match = protocolre.exec(address);

  return {
    protocol: match[1] ? match[1].toLowerCase() : '',
    slashes: !!match[2],
    rest: match[3]
  };
}

/**
 * Resolve a relative URL pathname against a base URL pathname.
 *
 * @param {String} relative Pathname of the relative URL.
 * @param {String} base Pathname of the base URL.
 * @return {String} Resolved pathname.
 * @private
 */
function resolve(relative, base) {
  if (relative === '') return base;

  var path = (base || '/').split('/').slice(0, -1).concat(relative.split('/'))
    , i = path.length
    , last = path[i - 1]
    , unshift = false
    , up = 0;

  while (i--) {
    if (path[i] === '.') {
      path.splice(i, 1);
    } else if (path[i] === '..') {
      path.splice(i, 1);
      up++;
    } else if (up) {
      if (i === 0) unshift = true;
      path.splice(i, 1);
      up--;
    }
  }

  if (unshift) path.unshift('');
  if (last === '.' || last === '..') path.push('');

  return path.join('/');
}

/**
 * The actual URL instance. Instead of returning an object we've opted-in to
 * create an actual constructor as it's much more memory efficient and
 * faster and it pleases my OCD.
 *
 * It is worth noting that we should not use `URL` as class name to prevent
 * clashes with the global URL instance that got introduced in browsers.
 *
 * @constructor
 * @param {String} address URL we want to parse.
 * @param {Object|String} [location] Location defaults for relative paths.
 * @param {Boolean|Function} [parser] Parser for the query string.
 * @private
 */
function Url(address, location, parser) {
  address = trimLeft(address);

  if (!(this instanceof Url)) {
    return new Url(address, location, parser);
  }

  var relative, extracted, parse, instruction, index, key
    , instructions = rules.slice()
    , type = typeof location
    , url = this
    , i = 0;

  //
  // The following if statements allows this module two have compatibility with
  // 2 different API:
  //
  // 1. Node.js's `url.parse` api which accepts a URL, boolean as arguments
  //    where the boolean indicates that the query string should also be parsed.
  //
  // 2. The `URL` interface of the browser which accepts a URL, object as
  //    arguments. The supplied object will be used as default values / fall-back
  //    for relative paths.
  //
  if ('object' !== type && 'string' !== type) {
    parser = location;
    location = null;
  }

  if (parser && 'function' !== typeof parser) parser = querystringify_1.parse;

  location = lolcation(location);

  //
  // Extract protocol information before running the instructions.
  //
  extracted = extractProtocol(address || '');
  relative = !extracted.protocol && !extracted.slashes;
  url.slashes = extracted.slashes || relative && location.slashes;
  url.protocol = extracted.protocol || location.protocol || '';
  address = extracted.rest;

  //
  // When the authority component is absent the URL starts with a path
  // component.
  //
  if (!extracted.slashes) instructions[3] = [/(.*)/, 'pathname'];

  for (; i < instructions.length; i++) {
    instruction = instructions[i];

    if (typeof instruction === 'function') {
      address = instruction(address);
      continue;
    }

    parse = instruction[0];
    key = instruction[1];

    if (parse !== parse) {
      url[key] = address;
    } else if ('string' === typeof parse) {
      if (~(index = address.indexOf(parse))) {
        if ('number' === typeof instruction[2]) {
          url[key] = address.slice(0, index);
          address = address.slice(index + instruction[2]);
        } else {
          url[key] = address.slice(index);
          address = address.slice(0, index);
        }
      }
    } else if ((index = parse.exec(address))) {
      url[key] = index[1];
      address = address.slice(0, index.index);
    }

    url[key] = url[key] || (
      relative && instruction[3] ? location[key] || '' : ''
    );

    //
    // Hostname, host and protocol should be lowercased so they can be used to
    // create a proper `origin`.
    //
    if (instruction[4]) url[key] = url[key].toLowerCase();
  }

  //
  // Also parse the supplied query string in to an object. If we're supplied
  // with a custom parser as function use that instead of the default build-in
  // parser.
  //
  if (parser) url.query = parser(url.query);

  //
  // If the URL is relative, resolve the pathname against the base URL.
  //
  if (
      relative
    && location.slashes
    && url.pathname.charAt(0) !== '/'
    && (url.pathname !== '' || location.pathname !== '')
  ) {
    url.pathname = resolve(url.pathname, location.pathname);
  }

  //
  // We should not add port numbers if they are already the default port number
  // for a given protocol. As the host also contains the port number we're going
  // override it with the hostname which contains no port number.
  //
  if (!requiresPort(url.port, url.protocol)) {
    url.host = url.hostname;
    url.port = '';
  }

  //
  // Parse down the `auth` for the username and password.
  //
  url.username = url.password = '';
  if (url.auth) {
    instruction = url.auth.split(':');
    url.username = instruction[0] || '';
    url.password = instruction[1] || '';
  }

  url.origin = url.protocol && url.host && url.protocol !== 'file:'
    ? url.protocol +'//'+ url.host
    : 'null';

  //
  // The href is just the compiled result.
  //
  url.href = url.toString();
}

/**
 * This is convenience method for changing properties in the URL instance to
 * insure that they all propagate correctly.
 *
 * @param {String} part          Property we need to adjust.
 * @param {Mixed} value          The newly assigned value.
 * @param {Boolean|Function} fn  When setting the query, it will be the function
 *                               used to parse the query.
 *                               When setting the protocol, double slash will be
 *                               removed from the final url if it is true.
 * @returns {URL} URL instance for chaining.
 * @public
 */
function set(part, value, fn) {
  var url = this;

  switch (part) {
    case 'query':
      if ('string' === typeof value && value.length) {
        value = (fn || querystringify_1.parse)(value);
      }

      url[part] = value;
      break;

    case 'port':
      url[part] = value;

      if (!requiresPort(value, url.protocol)) {
        url.host = url.hostname;
        url[part] = '';
      } else if (value) {
        url.host = url.hostname +':'+ value;
      }

      break;

    case 'hostname':
      url[part] = value;

      if (url.port) value += ':'+ url.port;
      url.host = value;
      break;

    case 'host':
      url[part] = value;

      if (/:\d+$/.test(value)) {
        value = value.split(':');
        url.port = value.pop();
        url.hostname = value.join(':');
      } else {
        url.hostname = value;
        url.port = '';
      }

      break;

    case 'protocol':
      url.protocol = value.toLowerCase();
      url.slashes = !fn;
      break;

    case 'pathname':
    case 'hash':
      if (value) {
        var char = part === 'pathname' ? '/' : '#';
        url[part] = value.charAt(0) !== char ? char + value : value;
      } else {
        url[part] = value;
      }
      break;

    default:
      url[part] = value;
  }

  for (var i = 0; i < rules.length; i++) {
    var ins = rules[i];

    if (ins[4]) url[ins[1]] = url[ins[1]].toLowerCase();
  }

  url.origin = url.protocol && url.host && url.protocol !== 'file:'
    ? url.protocol +'//'+ url.host
    : 'null';

  url.href = url.toString();

  return url;
}

/**
 * Transform the properties back in to a valid and full URL string.
 *
 * @param {Function} stringify Optional query stringify function.
 * @returns {String} Compiled version of the URL.
 * @public
 */
function toString(stringify) {
  if (!stringify || 'function' !== typeof stringify) stringify = querystringify_1.stringify;

  var query
    , url = this
    , protocol = url.protocol;

  if (protocol && protocol.charAt(protocol.length - 1) !== ':') protocol += ':';

  var result = protocol + (url.slashes ? '//' : '');

  if (url.username) {
    result += url.username;
    if (url.password) result += ':'+ url.password;
    result += '@';
  }

  result += url.host + url.pathname;

  query = 'object' === typeof url.query ? stringify(url.query) : url.query;
  if (query) result += '?' !== query.charAt(0) ? '?'+ query : query;

  if (url.hash) result += url.hash;

  return result;
}

Url.prototype = { set: set, toString: toString };

//
// Expose the URL parser and some additional properties that might be useful for
// others or testing.
//
Url.extractProtocol = extractProtocol;
Url.location = lolcation;
Url.trimLeft = trimLeft;
Url.qs = querystringify_1;

var urlParse = Url;

/**
 * parseURL - decompose a URL into its parts
 * @param  {String} url a URL
 * @return {Object} parts of the URL, including the following
 *
 * 'https://www.yahoo.com:1234/mypage?test=yes#abc'
 *
 * {
 *   host: 'www.yahoo.com:1234',
 *   protocol: 'https:',
 *   search: '?test=yes',
 *   hash: '#abc',
 *   href: 'https://www.yahoo.com:1234/mypage?test=yes#abc',
 *   pathname: '/mypage',
 *   fullpath: '/mypage?test=yes'
 * }
 */
function parseURL(url) {
    var parsedUrl = new urlParse(url);
    if (!parsedUrl.host) {
        // eslint-disable-next-line no-self-assign
        parsedUrl.href = parsedUrl.href; // IE: load the host and protocol
    }
    var pathname = parsedUrl.pathname;
    if (pathname.charAt(0) !== '/') {
        pathname = '/' + pathname; // IE: prepend leading slash
    }
    var host = parsedUrl.host;
    if (parsedUrl.port === '80' || parsedUrl.port === '443') {
        host = parsedUrl.hostname; // IE: remove default port
    }
    return {
        host: host,
        protocol: parsedUrl.protocol,
        search: parsedUrl.query,
        hash: parsedUrl.hash,
        href: parsedUrl.href,
        pathname: pathname,
        fullpath: pathname + (parsedUrl.query || '') + (parsedUrl.hash || '')
    };
}

/**
 * Registry
 *
 * A registry is a map of HTTP verbs to route recognizers.
 */
var Registry = /** @class */ (function () {
    function Registry( /* host */) {
        // Herein we keep track of RouteRecognizer instances
        // keyed by HTTP method. Feel free to add more as needed.
        this.verbs = {
            GET: new RouteRecognizer(),
            PUT: new RouteRecognizer(),
            POST: new RouteRecognizer(),
            DELETE: new RouteRecognizer(),
            PATCH: new RouteRecognizer(),
            HEAD: new RouteRecognizer(),
            OPTIONS: new RouteRecognizer()
        };
    }
    return Registry;
}());

/**
 * Hosts
 *
 * a map of hosts to Registries, ultimately allowing
 * a per-host-and-port, per HTTP verb lookup of RouteRecognizers
 */
function Hosts() {
    this._registries = {};
}
/**
 * Hosts#forURL - retrieve a map of HTTP verbs to RouteRecognizers
 *                for a given URL
 *
 * @param  {String} url a URL
 * @return {Registry}   a map of HTTP verbs to RouteRecognizers
 *                      corresponding to the provided URL's
 *                      hostname and port
 */
Hosts.prototype.forURL = function (url) {
    var host = parseURL(url).host;
    var registry = this._registries[host];
    if (registry === undefined) {
        registry = (this._registries[host] = new Registry(host));
    }
    return registry.verbs;
};
function Pretender( /* routeMap1, routeMap2, ..., options*/) {
    this.hosts = new Hosts();
    var lastArg = arguments[arguments.length - 1];
    var options = typeof lastArg === 'object' ? lastArg : null;
    var shouldNotTrack = options && (options.trackRequests === false);
    var noopArray = { push: function () { }, length: 0 };
    this.handlers = [];
    this.handledRequests = shouldNotTrack ? noopArray : [];
    this.passthroughRequests = shouldNotTrack ? noopArray : [];
    this.unhandledRequests = shouldNotTrack ? noopArray : [];
    this.requestReferences = [];
    this.forcePassthrough = options && (options.forcePassthrough === true);
    this.disableUnhandled = options && (options.disableUnhandled === true);
    // reference the native XMLHttpRequest object so
    // it can be restored later
    this._nativeXMLHttpRequest = self.XMLHttpRequest;
    this.running = false;
    var ctx = { pretender: this };
    this.ctx = ctx;
    // capture xhr requests, channeling them into
    // the route map.
    self.XMLHttpRequest = interceptor(ctx);
    // polyfill fetch when xhr is ready
    this._fetchProps = FakeFetch ? ['fetch', 'Headers', 'Request', 'Response'] : [];
    this._fetchProps.forEach(function (name) {
        this['_native' + name] = self[name];
        self[name] = FakeFetch[name];
    }, this);
    // 'start' the server
    this.running = true;
    // trigger the route map DSL.
    var argLength = options ? arguments.length - 1 : arguments.length;
    for (var i = 0; i < argLength; i++) {
        this.map(arguments[i]);
    }
}
function interceptor(ctx) {
    function FakeRequest() {
        // super()
        FakeXMLHttpRequest.call(this);
    }
    FakeRequest.prototype = Object.create(FakeXMLHttpRequest.prototype);
    FakeRequest.prototype.constructor = FakeRequest;
    // extend
    FakeRequest.prototype.send = function send() {
        this.sendArguments = arguments;
        if (!ctx.pretender.running) {
            throw new Error('You shut down a Pretender instance while there was a pending request. ' +
                'That request just tried to complete. Check to see if you accidentally shut down ' +
                'a pretender earlier than you intended to');
        }
        FakeXMLHttpRequest.prototype.send.apply(this, arguments);
        if (ctx.pretender.checkPassthrough(this)) {
            this.passthrough();
        }
        else {
            ctx.pretender.handleRequest(this);
        }
    };
    FakeRequest.prototype.passthrough = function passthrough() {
        if (!this.sendArguments) {
            throw new Error('You attempted to passthrough a FakeRequest that was never sent. ' +
                'Call `.send()` on the original request first');
        }
        var xhr = createPassthrough(this);
        xhr.send.apply(xhr, this.sendArguments);
        return xhr;
    };
    function createPassthrough(fakeXHR) {
        // event types to handle on the xhr
        var evts = ['error', 'timeout', 'abort', 'readystatechange'];
        // event types to handle on the xhr.upload
        var uploadEvents = [];
        // properties to copy from the native xhr to fake xhr
        var lifecycleProps = ['readyState', 'responseText', 'response', 'responseXML', 'responseURL', 'status', 'statusText'];
        var xhr = fakeXHR._passthroughRequest = new ctx.pretender._nativeXMLHttpRequest();
        xhr.open(fakeXHR.method, fakeXHR.url, fakeXHR.async, fakeXHR.username, fakeXHR.password);
        if (fakeXHR.responseType === 'arraybuffer') {
            lifecycleProps = ['readyState', 'response', 'status', 'statusText'];
            xhr.responseType = fakeXHR.responseType;
        }
        // use onload if the browser supports it
        if ('onload' in xhr) {
            evts.push('load');
        }
        // add progress event for async calls
        // avoid using progress events for sync calls, they will hang https://bugs.webkit.org/show_bug.cgi?id=40996.
        if (fakeXHR.async && fakeXHR.responseType !== 'arraybuffer') {
            evts.push('progress');
            uploadEvents.push('progress');
        }
        // update `propertyNames` properties from `fromXHR` to `toXHR`
        function copyLifecycleProperties(propertyNames, fromXHR, toXHR) {
            for (var i = 0; i < propertyNames.length; i++) {
                var prop = propertyNames[i];
                if (prop in fromXHR) {
                    toXHR[prop] = fromXHR[prop];
                }
            }
        }
        // fire fake event on `eventable`
        function dispatchEvent(eventable, eventType, event) {
            eventable.dispatchEvent(event);
            if (eventable['on' + eventType]) {
                eventable['on' + eventType](event);
            }
        }
        // set the on- handler on the native xhr for the given eventType
        function createHandler(eventType) {
            xhr['on' + eventType] = function (event) {
                copyLifecycleProperties(lifecycleProps, xhr, fakeXHR);
                dispatchEvent(fakeXHR, eventType, event);
            };
        }
        // set the on- handler on the native xhr's `upload` property for
        // the given eventType
        function createUploadHandler(eventType) {
            if (xhr.upload) {
                xhr.upload['on' + eventType] = function (event) {
                    dispatchEvent(fakeXHR.upload, eventType, event);
                };
            }
        }
        var i;
        for (i = 0; i < evts.length; i++) {
            createHandler(evts[i]);
        }
        for (i = 0; i < uploadEvents.length; i++) {
            createUploadHandler(uploadEvents[i]);
        }
        if (fakeXHR.async) {
            xhr.timeout = fakeXHR.timeout;
            xhr.withCredentials = fakeXHR.withCredentials;
        }
        for (var h in fakeXHR.requestHeaders) {
            xhr.setRequestHeader(h, fakeXHR.requestHeaders[h]);
        }
        return xhr;
    }
    FakeRequest.prototype._passthroughCheck = function (method, args) {
        if (this._passthroughRequest) {
            return this._passthroughRequest[method].apply(this._passthroughRequest, args);
        }
        return FakeXMLHttpRequest.prototype[method].apply(this, args);
    };
    FakeRequest.prototype.abort = function abort() {
        return this._passthroughCheck('abort', arguments);
    };
    FakeRequest.prototype.getResponseHeader = function getResponseHeader() {
        return this._passthroughCheck('getResponseHeader', arguments);
    };
    FakeRequest.prototype.getAllResponseHeaders = function getAllResponseHeaders() {
        return this._passthroughCheck('getAllResponseHeaders', arguments);
    };
    if (ctx.pretender._nativeXMLHttpRequest.prototype._passthroughCheck) {
        // eslint-disable-next-line no-console
        console.warn('You created a second Pretender instance while there was already one running. ' +
            'Running two Pretender servers at once will lead to unexpected results and will ' +
            'be removed entirely in a future major version.' +
            'Please call .shutdown() on your instances when you no longer need them to respond.');
    }
    return FakeRequest;
}
function verbify(verb) {
    return function (path, handler, async) {
        return this.register(verb, path, handler, async);
    };
}
function scheduleProgressEvent(request, startTime, totalTime) {
    setTimeout(function () {
        if (!request.aborted && !request.status) {
            var elapsedTime = new Date().getTime() - startTime.getTime();
            var progressTotal;
            var body = request.requestBody;
            if (!body) {
                progressTotal = 0;
            }
            else {
                // Support Blob, BufferSource, USVString, ArrayBufferView
                progressTotal = body.byteLength || body.size || body.length || 0;
            }
            var progressTransmitted = totalTime <= 0 ? 0 : (elapsedTime / totalTime) * progressTotal;
            // ProgressEvent expects loaded, total
            // https://xhr.spec.whatwg.org/#interface-progressevent
            request.upload._progress(true, progressTransmitted, progressTotal);
            request._progress(true, progressTransmitted, progressTotal);
            scheduleProgressEvent(request, startTime, totalTime);
        }
    }, 50);
}
function isArray(array) {
    return Object.prototype.toString.call(array) === '[object Array]';
}
var PASSTHROUGH = {};
Pretender.prototype = {
    get: verbify('GET'),
    post: verbify('POST'),
    put: verbify('PUT'),
    'delete': verbify('DELETE'),
    patch: verbify('PATCH'),
    head: verbify('HEAD'),
    options: verbify('OPTIONS'),
    map: function (maps) {
        maps.call(this);
    },
    register: function register(verb, url, handler, async) {
        if (!handler) {
            throw new Error('The function you tried passing to Pretender to handle ' +
                verb + ' ' + url + ' is undefined or missing.');
        }
        handler.numberOfCalls = 0;
        handler.async = async;
        this.handlers.push(handler);
        var registry = this.hosts.forURL(url)[verb];
        registry.add([{
                path: parseURL(url).fullpath,
                handler: handler
            }]);
        return handler;
    },
    passthrough: PASSTHROUGH,
    checkPassthrough: function checkPassthrough(request) {
        var verb = request.method.toUpperCase();
        var path = parseURL(request.url).fullpath;
        var recognized = this.hosts.forURL(request.url)[verb].recognize(path);
        var match = recognized && recognized[0];
        if ((match && match.handler === PASSTHROUGH) || this.forcePassthrough) {
            this.passthroughRequests.push(request);
            this.passthroughRequest(verb, path, request);
            return true;
        }
        return false;
    },
    handleRequest: function handleRequest(request) {
        var verb = request.method.toUpperCase();
        var path = request.url;
        var handler = this._handlerFor(verb, path, request);
        if (handler) {
            handler.handler.numberOfCalls++;
            var async = handler.handler.async;
            this.handledRequests.push(request);
            var pretender = this;
            var _handleRequest = function (statusHeadersAndBody) {
                if (!isArray(statusHeadersAndBody)) {
                    var note = 'Remember to `return [status, headers, body];` in your route handler.';
                    throw new Error('Nothing returned by handler for ' + path + '. ' + note);
                }
                var status = statusHeadersAndBody[0];
                var headers = pretender.prepareHeaders(statusHeadersAndBody[1]);
                var body = pretender.prepareBody(statusHeadersAndBody[2], headers);
                pretender.handleResponse(request, async, function () {
                    request.respond(status, headers, body);
                    pretender.handledRequest(verb, path, request);
                });
            };
            try {
                var result = handler.handler(request);
                if (result && typeof result.then === 'function') {
                    // `result` is a promise, resolve it
                    result.then(function (resolvedResult) {
                        _handleRequest(resolvedResult);
                    });
                }
                else {
                    _handleRequest(result);
                }
            }
            catch (error) {
                this.erroredRequest(verb, path, request, error);
                this.resolve(request);
            }
        }
        else {
            if (!this.disableUnhandled) {
                this.unhandledRequests.push(request);
                this.unhandledRequest(verb, path, request);
            }
        }
    },
    handleResponse: function handleResponse(request, strategy, callback) {
        var delay = typeof strategy === 'function' ? strategy() : strategy;
        delay = typeof delay === 'boolean' || typeof delay === 'number' ? delay : 0;
        if (delay === false) {
            callback();
        }
        else {
            var pretender = this;
            pretender.requestReferences.push({
                request: request,
                callback: callback
            });
            if (delay !== true) {
                scheduleProgressEvent(request, new Date(), delay);
                setTimeout(function () {
                    pretender.resolve(request);
                }, delay);
            }
        }
    },
    resolve: function resolve(request) {
        for (var i = 0, len = this.requestReferences.length; i < len; i++) {
            var res = this.requestReferences[i];
            if (res.request === request) {
                res.callback();
                this.requestReferences.splice(i, 1);
                break;
            }
        }
    },
    requiresManualResolution: function (verb, path) {
        var handler = this._handlerFor(verb.toUpperCase(), path, {});
        if (!handler) {
            return false;
        }
        var async = handler.handler.async;
        return typeof async === 'function' ? async() === true : async === true;
    },
    prepareBody: function (body) { return body; },
    prepareHeaders: function (headers) { return headers; },
    handledRequest: function ( /* verb, path, request */) { },
    passthroughRequest: function ( /* verb, path, request */) { },
    unhandledRequest: function (verb, path /*, request */) {
        throw new Error('Pretender intercepted ' + verb + ' ' +
            path + ' but no handler was defined for this type of request');
    },
    erroredRequest: function (verb, path, request, error) {
        error.message = 'Pretender intercepted ' + verb + ' ' +
            path + ' but encountered an error: ' + error.message;
        throw error;
    },
    _handlerFor: function (verb, url, request) {
        var registry = this.hosts.forURL(url)[verb];
        var matches = registry.recognize(parseURL(url).fullpath);
        var match = matches ? matches[0] : null;
        if (match) {
            request.params = match.params;
            request.queryParams = matches.queryParams;
        }
        return match;
    },
    shutdown: function shutdown() {
        self.XMLHttpRequest = this._nativeXMLHttpRequest;
        this._fetchProps.forEach(function (name) {
            self[name] = this['_native' + name];
        }, this);
        this.ctx.pretender = undefined;
        // 'stop' the server
        this.running = false;
    }
};
Pretender.parseURL = parseURL;
Pretender.Hosts = Hosts;
Pretender.Registry = Registry;

export default Pretender;
