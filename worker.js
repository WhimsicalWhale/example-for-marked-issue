/* globals marked, unfetch, ES6Promise, Promise */ // eslint-disable-line no-redeclare

if (!self.Promise) {
  self.importScripts('https://cdn.jsdelivr.net/npm/es6-promise/dist/es6-promise.js');
  self.Promise = ES6Promise;
}
if (!self.fetch) {
  self.importScripts('https://cdn.jsdelivr.net/npm/unfetch/dist/unfetch.umd.js');
  self.fetch = unfetch;
}

var versionCache = {};
var currentVersion;

onunhandledrejection = function(e) {
  throw e.reason;
};

onmessage = function(e) {
  if (e.data.version === currentVersion) {
    parse(e);
  } else {
    loadVersion(e.data.version).then(function() {
      parse(e);
    });
  }
};

function parse(e) {
  switch (e.data.task) {
    case 'defaults':

      var defaults = {};
      if (typeof marked.getDefaults === 'function') {
        defaults = marked.getDefaults();
        delete defaults.renderer;
      } else if ('defaults' in marked) {
        for (var prop in marked.defaults) {
          if (prop !== 'renderer') {
            defaults[prop] = marked.defaults[prop];
          }
        }
      }
      postMessage({
        id: e.data.id,
        task: e.data.task,
        defaults: defaults
      });
      break;
    case 'parse':
      var startTime = new Date();
      var lexed = marked.lexer(e.data.markdown, e.data.options);
      var lexedList = jsonString(lexed);
      var parsed = marked.parser(lexed, e.data.options);
      console.log('using marked.parse fed lexed');
      console.log(parsed);
      console.log('using just marked, no options');
      console.log(marked(e.data.markdown));
      var endTime = new Date();
      postMessage({
        id: e.data.id,
        task: e.data.task,
        lexed: lexedList,
        parsed: parsed,
        time: endTime - startTime
      });
      break;
  }
}

function stringRepeat(char, times) {
  var s = '';
  for (var i = 0; i < times; i++) {
    s += char;
  }
  return s;
}

function jsonString(input, level) {
  level = level || 0;
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return '[]';
    }
    var items = [],
        i;
    if (!Array.isArray(input[0]) && typeof input[0] === 'object' && input[0] !== null) {
      for (i = 0; i < input.length; i++) {
        items.push(stringRepeat(' ', 2 * level) + jsonString(input[i], level + 1));
      }
      return '[\n' + items.join('\n') + '\n]';
    }
    for (i = 0; i < input.length; i++) {
      items.push(jsonString(input[i], level));
    }
    return '[' + items.join(', ') + ']';
  } else if (typeof input === 'object' && input !== null) {
    var props = [];
    for (var prop in input) {
      props.push(prop + ':' + jsonString(input[prop], level));
    }
    return '{' + props.join(', ') + '}';
  } else {
    return JSON.stringify(input);
  }
}

function loadVersion(ver) {
  var promise;
  if (versionCache[ver]) {
    promise = Promise.resolve(versionCache[ver]);
  } else {
    promise = fetch(ver)
      .then(function(res) { return res.text(); })
      .then(function(text) {
        versionCache[ver] = text;
        return text;
      });
  }
  return promise.then(function(text) {
    try {
      // eslint-disable-next-line no-new-func
      Function(text)();
      marked.use({ extensions: [descriptionlist, description] });
    } catch (err) {
      throw new Error('Cannot load that version of marked');
    }
    currentVersion = ver;
  });
}

const descriptionlist = {
  name: 'descriptionList',
  level: 'block',                                     // Is this a block-level or inline-level tokenizer?
  start(src) { return src.match(/:[^:\n]/)?.index; }, // Hint to Marked.js to stop and check for a match
  tokenizer(src, tokens) {
    const rule = /^(?::[^:\n]+:[^:\n]*(?:\n|$))+/;    // Regex for the complete token
    const match = rule.exec(src);
    if (match) {
      const token = {                                 // Token to generate
        type: 'descriptionList',                      // Should match "name" above
        raw: match[0],                                // Text to consume from the source
        text: match[0].trim(),                        // Additional custom properties
        tokens: []                                    // Array where child inline tokens will be generated
      };
      this.lexer.inline(token.text, token.tokens);    // Queue this data to be processed for inline tokens
      return token;
    }
  },
  renderer(token) {
    return `<dl>${this.parser.parseInline(token.tokens)}\n</dl>`; // parseInline to turn child tokens into HTML
  }
};

const description = {
  name: 'description',
  level: 'inline',                                 // Is this a block-level or inline-level tokenizer?
  start(src) { return src.match(/:/)?.index; },    // Hint to Marked.js to stop and check for a match
  tokenizer(src, tokens) {
    const rule = /^:([^:\n]+):([^:\n]*)(?:\n|$)/;  // Regex for the complete token
    const match = rule.exec(src);
    if (match) {
      return {                                         // Token to generate
        type: 'description',                           // Should match "name" above
        raw: match[0],                                 // Text to consume from the source
        dt: this.lexer.inlineTokens(match[1].trim()),  // Additional custom properties, including
        dd: this.lexer.inlineTokens(match[2].trim())   //   any further-nested inline tokens
      };
    }
  },
  renderer(token) {
    return `\n<dt>${this.parser.parseInline(token.dt)}</dt><dd>${this.parser.parseInline(token.dd)}</dd>`;
  },
  childTokens: ['dt', 'dd'],                 // Any child tokens to be visited by walkTokens
  walkTokens(token) {                        // Post-processing on the completed token tree
    if (token.type === 'strong') {
      token.text += ' walked';
    }
  }
};
