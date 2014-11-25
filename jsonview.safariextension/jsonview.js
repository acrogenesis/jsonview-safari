this.data = document.body.innerHTML;
this.uri = document.location.href;

if(document.getElementsByTagName("pre")[0]){
  // console.log("JSONView: data is wrapped in <pre>...</pre>, stripping HTML...");
  this.data = document.getElementsByTagName("pre")[0].innerHTML;
}

var json_regex = /^\s*([\[\{].*[\}\]])\s*$/; // Ghetto, but it works
var jsonp_regex = /^[\s\u200B\uFEFF]*([\w$\[\]\.]+)[\s\u200B\uFEFF]*\([\s\u200B\uFEFF]*([\[{][\s\S]*[\]}])[\s\u200B\uFEFF]*\);?[\s\u200B\uFEFF]*$/;
var jsonp_regex2 = /([\[\{][\s\S]*[\]\}])\)/; // more liberal support... this allows us to pass the jsonp.json & jsonp2.json tests
var is_json = json_regex.test(this.data);
var is_jsonp = jsonp_regex.test(this.data);
// console.log("JSONView: is_json="+is_json+" is_jsonp="+is_jsonp);

if(is_json || is_jsonp){
  /*
   * The JSONFormatter helper object. This contains two major functions, jsonToHTML and errorPage,
   * each of which returns an HTML document.
   */
  function JSONFormatter() { }

  JSONFormatter.prototype = {
    /**
     * Completely escape a json string
     */
    jsString: function(s) {
      // Slice off the surrounding quotes
      s = JSON.stringify(s).slice(1, -1);
      return s;
    },

    /**
     * Is this a valid "bare" property name?
     */
    isBareProp: function(prop) {
      return /^[A-Za-z_$][A-Za-z0-9_\-$]*$/.test(prop);
    },

    /**
     * Surround value with a span, including the given className
     */
    decorateWithSpan: function(value, className) {
      return '<span class="' + className + '">' + value + '</span>';
    },

    // Convert a basic JSON datatype (number, string, boolean, null, object, array) into an HTML fragment.
    valueToHTML: function(value, path) {
      var valueType = typeof value;

      if (value === null) {
        return this.decorateWithSpan('null', 'null');
      }
      else if (Array.isArray(value)) {
        return this.arrayToHTML(value, path);
      }
      else if (valueType == 'object') {
        return this.objectToHTML(value, path);
      }
      else if (valueType == 'number') {
        return this.decorateWithSpan(value, 'num');
      }
      else if (valueType == 'string') {
        if (/^(http|https|file):\/\/[^\s]+$/i.test(value)) {
          return '<a href="' + value + '"><span class="q">&quot;</span>' + this.jsString(value) + '<span class="q">&quot;</span></a>';
        } else {
          return '<span class="string">&quot;' + this.jsString(value) + '&quot;</span>';
        }
      }
      else if (valueType == 'boolean') {
        return this.decorateWithSpan(value, 'bool');
      }

      return '';
    },

    // Convert an array into an HTML fragment
    arrayToHTML: function(json, path) {
      if (json.length === 0) {
        return '[ ]';
      }

      var output = '';
      for (var i = 0; i < json.length; i++) {
        var subPath = path + '[' + i + ']';
        output += '<li>' + this.valueToHTML(json[i], subPath);
        if (i < json.length - 1) {
          output += ',';
        }
        output += '</li>';
      }
      return '<span class="collapser"></span>[<ul class="array collapsible">' + output + '</ul>]';
    },

    // Convert a JSON object to an HTML fragment
    objectToHTML: function(json, path) {
      var numProps = Object.keys(json).length;
      if (numProps === 0) {
        return '{ }';
      }

      var output = '';
      for (var prop in json) {
        var subPath = '';
        var escapedProp = JSON.stringify(prop).slice(1, -1);
        var bare = this.isBareProp(prop);
        if (bare) {
          subPath = path + '.' + escapedProp;
        } else {
          escapedProp = '"' + escapedProp + '"';
        }
        output += '<li><span class="prop' + (bare ? '' : ' quoted') + '" title="' + subPath +
          '"><span class="q">&quot;</span>' + this.jsString(prop) +
          '<span class="q">&quot;</span></span>: ' + this.valueToHTML(json[prop], subPath);
        if (numProps > 1) {
          output += ',';
        }
        output += '</li>';
        numProps--;
      }

      return '<span class="collapser"></span>{<ul class="obj collapsible">' + output + '</ul>}';
    },

    // Convert a whole JSON value / JSONP response into a formatted HTML document
    jsonToHTML: function(json, callback, uri) {
      var output = '<div id="json">' + this.valueToHTML(json, '<root>') + '</div>';
      if (callback) {
        output = '<div class="callback">' + callback + '(</div>' + output + '<div class="callback">)</div>';
      }
      return this.toHTML(output, uri);
    },

    // Clean up a JSON parsing error message
    massageError: function(error) {
      var message = error.message.replace(/^JSON.parse: /, '').replace(/of the JSON data/, '');
      var parts = /line (\d+) column (\d+)/.exec(message);

      return {
        message: message,
        line: +parts[1],
        column: +parts[2]
      };
    },

    highlightError: function(data, lineNum, columnNum) {
      if (!lineNum || !columnNum) {
        return data;
      }

      var lines = data.match(/^.*((\r\n|\n|\r)|$)/gm);

      var output = '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        if (i == lineNum - 1) {
          output += '<span class="errorline">';
          output += line.substring(0, columnNum - 1) + '<span class="errorcolumn">' + line[columnNum - 1] + '</span>' + line.substring(columnNum);
          output += '</span>';
        } else {
          output += line;
        }
      }

      return output;
    },

    // Produce an error document for when parsing fails.
    errorPage: function(error, data, uri) {
      // Escape unicode nulls
      data = data.replace("\u0000","\uFFFD");

      var errorInfo = this.massageError(error);

      var output = '<div id="error">' + _('errorParsing');
      if (errorInfo.message) {
        output += '<div class="errormessage">' + errorInfo.message + '</div>';
      }
      output += '</div><div id="json">' + this.highlightError(data, errorInfo.line, errorInfo.column) + '</div>';
      return this.toHTML(output, uri + ' - Error');
    },

    // Wrap the HTML fragment in a full document. Used by jsonToHTML and errorPage.
    toHTML: function(content, title) {
      return '<!DOCTYPE html>\n' +
        '<html><head><meta charset="UTF-8"><title>' + title + '</title>' +
        '<link rel="stylesheet" type="text/css" href="' + safari.extension.baseURI + "default.css" + '">' +
        '</head><body>' +
        content +
        '</body></html>';
    }
  };

  // Sanitize & output -- all magic from JSONView Firefox
  this.jsonFormatter = new JSONFormatter();

  // This regex attempts to match a JSONP structure:
  //    * Any amount of whitespace (including unicode nonbreaking spaces) between the start of the file and the callback name
  //    * Callback name (any valid JavaScript function name according to ECMA-262 Edition 3 spec)
  //    * Any amount of whitespace (including unicode nonbreaking spaces)
  //    * Open parentheses
  //    * Any amount of whitespace (including unicode nonbreaking spaces)
  //    * Either { or [, the only two valid characters to start a JSON string.
  //    * Any character, any number of times
  //    * Either } or ], the only two valid closing characters of a JSON string.
  //    * Any amount of whitespace (including unicode nonbreaking spaces)
  //    * A closing parenthesis, an optional semicolon, and any amount of whitespace (including unicode nonbreaking spaces) until the end of the file.
  // This will miss anything that has comments, or more than one callback, or requires modification before use.
  var outputDoc = '';
  // text = text.match(jsonp_regex)[1];
  var cleanData = '',
      callback = '';

  var callback_results = jsonp_regex.exec(this.data);
  if( callback_results && callback_results.length == 3 ){
    // console.log("THIS IS JSONp");
    callback = callback_results[1];
    cleanData = callback_results[2];
  } else {
    // console.log("Vanilla JSON");
    cleanData = this.data;
  }
  // console.log(cleanData);

  // Covert, and catch exceptions on failure
  try {
    // var jsonObj = this.nativeJSON.decode(cleanData);
    var jsonObj = JSON.parse(cleanData);
    if ( jsonObj ) {
      outputDoc = this.jsonFormatter.jsonToHTML(jsonObj, callback, this.uri);
    } else {
      throw "There was no object!";
    }
  } catch(e) {
    // console.log(e);
    outputDoc = this.jsonFormatter.errorPage(e, this.data, this.uri);
  }
  // document.body.innerHTML = outputDoc;
  document.documentElement.innerHTML = outputDoc;

  //////////////////////////////////
  ////////BEGINS DEFAULT.JS/////////
  //////////////////////////////////

  // Click handler for collapsing and expanding objects and arrays
  function collapse(evt) {
    var collapser = evt.target;

    while (collapser && (!collapser.classList || !collapser.classList.contains('collapser'))) {
      collapser = collapser.nextSibling;
    }
    if (!collapser || !collapser.classList || !collapser.classList.contains('collapser')) {
      return;
    }

    evt.stopPropagation();

    collapser.classList.toggle('collapsed');

    var collapsible = collapser;
    while (collapsible && (!collapsible.classList || !collapsible.classList.contains('collapsible'))) {
      collapsible = collapsible.nextSibling;
    }
    collapsible.classList.toggle('collapsed');
  }

  /*
   * Collapses the whole json using keyboard
   * TODO: Add a navigator support for each of the elements
   */
  function collapseAll(evt) {
    var inputList;

    // Ignore anything paired with a modifier key. See https://github.com/bhollis/jsonview/issues/69
    if (evt.ctrlKey || evt.shiftKey || evt.altKey || evt.metaKey) {
      return;
    }

    if (evt.keyCode === 37) {  // Collapses the json on left arrow key up
      inputList = document.querySelectorAll('.collapsible, .collapser');
      for (var i = 0; i < inputList.length; i++) {
        if (inputList[i].parentNode.id != 'json') {
          inputList[i].classList.add('collapsed');
        }
      }
      evt.preventDefault();
    } else if (evt.keyCode === 39) { // Expands the json on right arrow key up
      inputList = document.querySelectorAll('.collapsed');
      for (var i = 0; i < inputList.length; i++) {
        inputList[i].classList.remove('collapsed');
      }
      evt.preventDefault();
    }
  }

  // collapse with event delegation
  document.addEventListener('click', collapse, false);
  document.addEventListener('keyup', collapseAll, false);

  //////////////////////////////////
  /////////ENDS DEFAULT.JS//////////
  //////////////////////////////////

  /**
  * Converts the markup to DOM nodes
  *
  * @private
  * @param {string|Markup} value The node
  * @return {Node}
  */
  function toDOM(value) {
    var wrapper = createElement('div');
    wrapper.innerHTML = ''+value;

    // trim extraneous whitespace
    trimWhitespace(wrapper);

    // eliminate wrapper for single nodes
    if (wrapper.childNodes.length === 1) {
      return wrapper.firstChild;
    }

    // create a document fragment to hold elements
    var frag = createElement('');
    while (wrapper.firstChild) {
      frag.appendChild(wrapper.firstChild);
    }
    return frag;
  }

}else {
  // console.log("JSONView: this is not json, not formatting.");
}
