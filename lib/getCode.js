const fs       = require('fs')
const Mustache = require('mustache')
const beautify = require('js-beautify').js_beautify
const lint     = require('jshint').JSHINT
const _        = require('lodash')

const getCode = function (opts, type) {
  // For Swagger Specification version 2.0 value of field 'swagger' must be a string '2.0'
  let data = opts.swagger.swagger === '2.0' ? require('./getViewForSwagger2')(opts, type) : require('./getViewForSwagger1')(opts, type)
  if (type === 'custom') {
    if (!_.isObject(opts.template) || !_.isString(opts.template.class) || !_.isString(opts.template.method)) {
      throw new Error('Unprovided custom template. Please use the following template: template: { class: "...", method: "...", request: "..." }')
    }
  }
  else {
    if (!_.isObject(opts.template)) {
      opts.template = {}
    }

    let templates        = __dirname + '/../templates/'
    opts.template.class  = opts.template.class || fs.readFileSync(templates + type + '-class.mustache', 'utf-8')
    opts.template.method = opts.template.method || fs.readFileSync(templates + (type === 'typescript' ? 'typescript-' : '') + 'method.mustache', 'utf-8')

    if (type === 'typescript') {
      opts.template.type = opts.template.type || fs.readFileSync(templates + 'type.mustache', 'utf-8')
    }
  }

  if (opts.mustache) {
    _.assign(data, opts.mustache)
  }

  let source      = Mustache.render(opts.template.class, data, opts.template)
  let lintOptions = {
    node: type === 'node' || type === 'custom',
    browser: type === 'angular' || type === 'custom' || type === 'react',
    undef: true,
    strict: true,
    trailing: true,
    smarttabs: true,
    maxerr: 999
  }

  if (opts.esnext) {
    lintOptions.esnext = true
  }

  if (type === 'typescript') {
    opts.lint = false
  }

  if (opts.lint === undefined || opts.lint === true) {
    lint(source, lintOptions)
    lint.errors.forEach(function (error) {
      if (error.code[0] === 'E') {
        throw new Error(error.reason + ' in ' + error.evidence + ' (' + error.code + ')')
      }
    })
  }

  if (opts.beautify === undefined || opts.beautify === true) {
    return beautify(source, {indent_size: 4, max_preserve_newlines: 2})
  }
  else {
    return source
  }
}

module.exports = getCode