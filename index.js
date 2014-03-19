var path = require("path");
var through = require('through');
var gutil = require('gulp-util');
var _ = require("underscore");
var yaml = require('js-yaml');

var PluginError = gutil.PluginError;
const PLUGIN_NAME = 'gulp-jadeblog';

function parseHeader (header) {
  return yaml.safeLoad(header);
}

function isMetadataSeparator (line) {
  return line.trim() === "---";
}

function splitMetadataAndContent (file) {
  var fileContent = file.contents.toString("utf-8");
  var lines = fileContent.split("\n");
  var state = "HEADER_NOT_FOUND";
  var metadata = [];
  var content = [];
  lines.forEach(function (line) {
    if (state === "HEADER_NOT_FOUND" && isMetadataSeparator(line)) {
      state = "PARSING_METADATA";
    } else if (state === "PARSING_METADATA") {
      if (isMetadataSeparator(line)) {
        state = "PARSING_BODY";
      } else {
        metadata.push(line);
      }
    } else {
      content.push("    " + line);
    }
  });

  var parsedMetadata = parseHeader(metadata.join("\n"));

  var ext = path.extname(file.relative);
  var relative = file.relative;
  parsedMetadata.url = "/" + relative.substring(0, relative.length - ext.length) + ".html";

  var result = {
    metadata : parsedMetadata,
    content : content.join("\n")
  };
  return result;
}

function fileToJade (file) {
  var result = [];
  var layout = file.parsed.metadata.layout || "default";

  result.push("extends /src/layouts/" + layout);
  result.push("block append content");

  var extname = path.extname(file.path);

  if (extname === ".md") {
    result.push("  :markdown");
    result.push(file.parsed.content);
  } else {
    result.push(file.parsed.content);
  }

  result.push("block vars");
  _.each(file.parsed.metadata, function (value, key) {
    result.push("  - var " + key + " = " + JSON.stringify(value));
  });

  file.contents = new Buffer(result.join("\n"), "utf-8");
}

function gulpJadeBlog () {

  var contextFiles = [];
  var context = {
    posts : []
  };

  function processFile (file) {
    if (file.isNull()) return;
    if (file.isStream()) return this.emit('error', new PluginError(PLUGIN_NAME, 'Streaming not supported'));

    file.parsed = splitMetadataAndContent(file);

    if (file.parsed.metadata.layout === "post") {
      context.posts.push(file.parsed.metadata);
    }

    if (file.parsed.metadata.context) {
      contextFiles.push(file);
    } else {
      fileToJade(file);
      this.emit("data", file);
    }
  }

  function processContextFiles () {
    _.each(contextFiles, function (file) {
      file.parsed.metadata.context = context;
      fileToJade(file);
      this.emit("data", file);
    }, this);
    this.emit("end");
  }

  return through(processFile, processContextFiles);
}

module.exports = gulpJadeBlog;