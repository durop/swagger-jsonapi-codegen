const _ = require('lodash')
const normalizeName = require('./normalizeName')
const getPathToMethodName = require('./getPathToMethodName')
const convertTypeClass = require('./convertType')
const convertType = convertTypeClass.convertType
const urlJoin = require('url-join')

const getViewForSwagger2 = function (opts, type) {
  let swagger = opts.swagger
  let authorizedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'COPY', 'HEAD', 'OPTIONS', 'LINK', 'UNLIK', 'PURGE', 'LOCK', 'UNLOCK', 'PROPFIND']

  let domain
  if (opts.host !== false) {
    domain = urlJoin(opts.host, swagger.basePath.replace(/\/+$/g, ''))
  } else {
    if ((swagger.schemes && swagger.schemes.length > 0 && swagger.host && swagger.basePath)) {
      domain = urlJoin(swagger.schemes[0] + '://' + swagger.host, swagger.basePath.replace(/\/+$/g, ''))
    }
  }

  let data = {
    isNode: type === 'node' || type === 'react',
    isES6: opts.isES6 || type === 'react',
    description: swagger.info.description,
    isSecure: swagger.securityDefinitions !== undefined,
    moduleName: opts.moduleName,
    className: opts.className,
    imports: opts.imports,
    domain: domain,
    methods: [],
    definitions: [],
    enumerations: []
  }

  if (opts.customEndpoint) {
    data.domain = opts.customEndpoint.protocol + '//' + opts.customEndpoint.host
  }

  _.forEach(swagger.paths, function (api, path) {
    let globalParams = []

    /**
     * @param {Object} op - meta data for the request
     * @param {string} m - HTTP method name - eg: 'get', 'post', 'put', 'delete'
     */
    _.forEach(api, function (op, m) {
      if (m.toLowerCase() === 'parameters') {
        globalParams = op
      }
    })

    _.forEach(api, function (op, m) {
      let M = m.toUpperCase()

      if (M === '' || authorizedMethods.indexOf(M) === -1) {
        return
      }

      let secureTypes = []

      if (swagger.securityDefinitions !== undefined || op.security !== undefined) {
        let mergedSecurity = _.merge([], swagger.security, op.security).map(function (security) {
          return Object.keys(security)
        })

        if (swagger.securityDefinitions) {
          for (let sk in swagger.securityDefinitions) {
            if (mergedSecurity.join(',').indexOf(sk) !== -1) {
              secureTypes.push(swagger.securityDefinitions[sk].type)
            }
          }
        }
      }

      let responseModelName, modelRawName

      if (op.operationId && op.operationId.indexOf('ResponseModel') > 0) {
        let operationIdDesc = op.operationId.split('-')

        if (operationIdDesc.length >= 2) {

          // has req/resp type annotations
          responseModelName = operationIdDesc[operationIdDesc.length - 1]

          modelRawName = responseModelName.replace('ResponseModel', '')

          operationIdDesc.pop() // remove responseModelName from descriptor

          op.operationId = operationIdDesc.join('.')
        }
      }

      let methodName = op.operationId ? normalizeName(op.operationId) : getPathToMethodName(opts, m, path)
      let method = {
        path: path,
        className: opts.className,
        methodName: methodName,
        modelRawName: modelRawName,
        isModelDriven: responseModelName,
        isNotModelDriven: !responseModelName,
        responseTypeName: responseModelName,
        method: M,
        isGET: M === 'GET',
        isPOST: M === 'POST',
        summary: op.description || op.summary,
        externalDocs: op.externalDocs,
        isSecure: swagger.security !== undefined || op.security !== undefined,
        isSecureToken: secureTypes.indexOf('oauth2') !== -1,
        isSecureApiKey: secureTypes.indexOf('apiKey') !== -1,
        isSecureBasic: secureTypes.indexOf('basic') !== -1,
        parameters: [],
        headers: []
      }

      if (method.isSecure && method.isSecureToken) {
        data.isSecureToken = method.isSecureToken
      }

      if (method.isSecure && method.isSecureApiKey) {
        data.isSecureApiKey = method.isSecureApiKey
      }

      if (method.isSecure && method.isSecureBasic) {
        data.isSecureBasic = method.isSecureBasic
      }

      let produces = op.produces || swagger.produces

      if (produces) {
        method.headers.push({
          name: 'Accept',
          value: `'${produces.map(function (value) {
            return value
          }).join(', ')}'`,
        })
      }

      let consumes = op.consumes || swagger.consumes

      if (consumes) {
        method.headers.push({name: 'Content-Type', value: '\'' + consumes + '\''})
      }

      if (consumes === 'application/x-www-form-urlencoded') {
        method.mustFormPost = true
      }

      let params = []

      if (_.isArray(op.parameters)) {
        params = op.parameters
      }

      params = params.concat(globalParams)

      const parameterCreate = function (parameter) {
        //Ignore parameters which contain the x-exclude-from-bindings extension
        if (parameter['x-exclude-from-bindings'] === true) {
          return
        }

        // Ignore headers which are injected by proxies & app servers
        // eg: https://cloud.google.com/appengine/docs/go/requests#Go_Request_headers
        if (parameter['x-proxy-header'] && !data.isNode) {
          return
        }

        if (_.isString(parameter.$ref)) {
          let segments = parameter.$ref.split('/')
          parameter = swagger.parameters[segments.length === 1 ? segments[0] : segments[2]]
        }

        if (parameter.enum && parameter.enum.length === 1) {
          parameter.isSingleton = true
          parameter.singleton = parameter.enum[0]
        }

        if (parameter.in === 'body') {
          parameter.isBodyParameter = true
        }
        else if (parameter.in === 'path') {
          parameter.isPathParameter = true
        }
        else if (parameter.in === 'query') {
          if (parameter['x-name-pattern']) {
            parameter.isPatternType = true
            parameter.pattern = parameter['x-name-pattern']
          }

          parameter.isQueryParameter = true
        }
        else if (parameter.in === 'header') {
          parameter.isHeaderParameter = true
        }
        else if (parameter.in === 'formData') {
          parameter.isFormParameter = true
        }

        parameter.camelCaseName = parameter.name
        parameter.tsType = convertType(parameter)
        parameter.cardinality = parameter.required ? '' : '?'

        return parameter
      }

      const parameterAdd = (parameter) => {
        if (parameter.in === 'body' && parameter.schema) {
          _.forIn(parameter.schema.properties, function (item, key) {
            let paramToAdd = {
              name: key,
              in: 'body'
            }
            if (parameter.schema.required && parameter.schema.required.indexOf(key) !== -1) {
              paramToAdd.required = true
            }
            _.forIn(item, function (val, name) {
              paramToAdd[name] = val
            })

            method.parameters.push(parameterCreate(paramToAdd))
          })
        }
        else {
          return method.parameters.push(parameterCreate(parameter))
        }
      }

      _.forEach(params, parameterAdd)

      data.methods.push(method)
    })
  })

  _.forEach(swagger.definitions, function (definition, name) {
    // guards from generating internal model interfaces like "RepresentationModel"
    if (name.indexOf('ResponseModel') > 0) {
      let isModel = name.indexOf('Response') > 0,
        isRequestType = name.indexOf('Request') > 0

      let modelPlainName = name.replace('Response', '')
      let modelRawName = modelPlainName.replace('Model', '')

      let hasIncluded = false,
        includedTypeDef = '',
        includedRelations = []

      if (definition.additionalProperties && _.isArray(definition.additionalProperties)) {
        definition.additionalProperties.forEach(function (includedSpec) {
          let includedTypeName = includedSpec.split(':')[1],
            includeType = includedSpec.split(':')[0]

          if (includedTypeName && includedTypeName.indexOf('ResponseModel') > 0) {
            let plural = ''

            if (includeType === 'includes_many') {
              plural = 's'
            }

            hasIncluded = true

            let includedTypeNameDef = 'I' + includedTypeName.replace('ResponseModel', 'ModelResponseData')

            if (includedTypeDef.length > 0) {
              includedTypeDef += '|'
            }

            includedTypeDef += includedTypeNameDef + '[]'

            includedRelations.push({
              includeKey: includedTypeName.replace('ResponseModel', '').toLowerCase() + plural,
              includeTypeDef: 'I' + includedTypeName.replace('ResponseModel', '') + (plural ? '[]' : '')
            })
          }
        })
      }

      data.definitions.push({
        name: name,
        includedRelations: includedRelations,
        hasIncluded: hasIncluded,
        includedTypeDef: includedTypeDef,
        modelRawName: modelRawName,
        modelPlainName: modelPlainName,
        description: definition.description,
        isModel: isModel,
        isRequest: isRequestType,
        tsType: convertType(definition, swagger)
      })
    }
  })

  let addedEnumerations = []
  _.forEach(convertTypeClass.enumerations, function (enumeration) {
    // Ensure we only have one definition for every interface/enum because the same enum can be used in different
    // swagger paths
    if (addedEnumerations.indexOf(enumeration.tsType) > -1) {
      return // it's the lodash version of "continue"
    }

    addedEnumerations.push(enumeration.tsType)
    data.enumerations.push(enumeration)
  })

  return data
}

module.exports = getViewForSwagger2