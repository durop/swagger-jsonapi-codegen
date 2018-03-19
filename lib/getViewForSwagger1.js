const _ = require('lodash')

const getViewForSwagger1 = function (opts, type) {
  let swagger = opts.swagger
  let data    = {
    isNode: type === 'node' || type === 'react',
    isES6: opts.isES6 || type === 'react',
    description: swagger.description,
    moduleName: opts.moduleName,
    className: opts.className,
    domain: swagger.basePath ? swagger.basePath : '',
    methods: []
  }

  swagger.apis.forEach(function (api) {
    api.operations.forEach(function (op) {
      if (op.method === 'OPTIONS') {
        return
      }

      let method = {
        path: api.path,
        className: opts.className,
        methodName: op.nickname,
        method: op.method,
        isGET: op.method === 'GET',
        isPOST: op.method.toUpperCase() === 'POST',
        summary: op.summary,
        parameters: op.parameters,
        headers: []
      }

      if (op.produces) {
        let headers = []

        headers.value = []
        headers.name  = 'Accept'
        headers.value.push(op.produces.map(function (value) {
          return '\'' + value + '\''
        }).join(', '))
        method.headers.push(headers)
      }

      op.parameters = op.parameters ? op.parameters : []
      op.parameters.forEach(function (parameter) {
        parameter.camelCaseName = _.camelCase(parameter.name)
        if (parameter.enum && parameter.enum.length === 1) {
          parameter.isSingleton = true
          parameter.singleton   = parameter.enum[0]
        }
        if (parameter.paramType === 'body') {
          parameter.isBodyParameter = true
        }
        else if (parameter.paramType === 'path') {
          parameter.isPathParameter = true
        }
        else if (parameter.paramType === 'query') {
          if (parameter['x-name-pattern']) {
            parameter.isPatternType = true
            parameter.pattern       = parameter['x-name-pattern']
          }
          parameter.isQueryParameter = true
        }
        else if (parameter.paramType === 'header') {
          parameter.isHeaderParameter = true
        }
        else if (parameter.paramType === 'form') {
          parameter.isFormParameter = true
        }
      })

      data.methods.push(method)
    })
  })
  return data
}

module.exports = getViewForSwagger1