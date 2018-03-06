const fs = require('fs');
const Mustache = require('mustache');
const beautify = require('js-beautify').js_beautify;
const lint = require('jshint').JSHINT;
const _ = require('lodash');

// Contains all collected enumerations from swagger documentation
let enumerations = [];
let enumerationsNameCache = [];

/**
 *
 * @param id
 */
const normalizeName = function (id) {
  return _.camelCase(id.replace(/\.|\-|\{|\}/g, '_'));
};

/**
 * Generates a unique enum name for potential Interfaces
 * @param name
 * @param counter
 * @returns {*}
 */
const generateEnumName = (name, counter) => {
  if (!name) {
    name = 'IEnum' + enumerationsNameCache.length
  } else {
    name = `I${_.upperFirst(normalizeName(name))}`
  }

  if (counter) {
    name += String(counter)
  }

  if (enumerationsNameCache.indexOf(name) !== -1) {
    if (!counter) {
      counter = 0
    }

    ++counter
    return generateEnumName(name, counter)
  } else {
    return name
  }
}

const getPathToMethodName = function (opts, m, path) {
  if (path === '/' || path === '') {
    return m;
  }

  // clean url path for requests ending with '/'
  let cleanPath = path.replace(/\/$/, '');

  let segments = cleanPath.split('/').slice(1);
  segments = _.transform(segments, function (result, segment) {
    if (segment[0] === '{' && segment[segment.length - 1] === '}') {
      segment = 'by' + segment[1].toUpperCase() + segment.substring(2, segment.length - 1);
    }
    result.push(segment);
  });
  let result = _.camelCase(segments.join('-'));

  return m.toLowerCase() + result[0].toUpperCase() + result.substring(1);
};

/**
 * Recursively converts a swagger type description into a typescript type, i.e., a model for our mustache
 * template.
 *
 * Not all type are currently supported, but they should be straightforward to add.
 *
 * @param swaggerType a swagger type definition, i.e., the right hand side of a swagger type definition.
 * @param swagger
 * @returns a recursive structure representing the type, which can be used as a template model.
 */
function convertType(swaggerType, swagger) {
  let typespec = {description: swaggerType.description, isEnum: false};

  if (swaggerType.hasOwnProperty('schema')) {
    return convertType(swaggerType.schema);
  } else if (_.isString(swaggerType.$ref)) {
    typespec.tsType = 'ref';
    typespec.target = swaggerType.$ref.substring(swaggerType.$ref.lastIndexOf('/') + 1);
  } else if (swaggerType.hasOwnProperty('enum')) {
    typespec.tsType = generateEnumName(swaggerType.name);
    typespec.isAtomic = true;
    typespec.isEnum = true;
    typespec.enum = swaggerType.enum;

    enumerations.push(typespec);
  } else if (swaggerType.type === 'string') {
    typespec.tsType = 'string';
  } else if (swaggerType.type === 'number' || swaggerType.type === 'integer') {
    typespec.tsType = 'number';
  } else if (swaggerType.type === 'boolean') {
    typespec.tsType = 'boolean';
  } else if (swaggerType.type === 'array') {
    typespec.tsType = 'array';
    typespec.elementType = convertType(swaggerType.items);
  } else /*if (swaggerType.type === 'object')*/ { //remaining types are created as objects
    if (swaggerType.minItems >= 0 && swaggerType.hasOwnProperty('title') && !swaggerType.$ref) {
      typespec.tsType = 'any';
    }
    else {
      typespec.tsType = 'object';
      typespec.properties = [];

      if (swaggerType.allOf) {
        _.forEach(swaggerType.allOf, function (ref) {
          if (ref.$ref) {
            let refSegments = ref.$ref.split('/');
            let name = refSegments[refSegments.length - 1];
            _.forEach(swagger.definitions, function (definition, definitionName) {
              if (definitionName === name) {
                var property = convertType(definition, swagger);
                typespec.properties.push(...property.properties);
              }
            });
          } else {
            var property = convertType(ref);
            typespec.properties.push(...property.properties);
          }
        });
      }

      _.forEach(swaggerType.properties, function (propertyType, propertyName) {

        var property = convertType(propertyType);
        property.name = propertyName;

        if (swaggerType.required && typeof _.isArray(swaggerType)) {

          swaggerType.required.forEach(function (requiredPropertyName) {

            if (propertyName === requiredPropertyName) {
              property.isRequired = true;
            }
          });
        }

        if (!property.isRequired) {
          property.isOptional = true;
        }

        typespec.properties.push(property);
      });

      let hasIdProperty = false;

      typespec.properties.forEach((prop) => {
        if (prop.name === 'id') {
          hasIdProperty = true;
        }
      });

      // add only if not already added
      if (!hasIdProperty) {
        // every model has an id
        typespec.properties.push({
          description: "Unique id",
          isEnum: false,
          tsType: 'number',
          isRef: false,
          isObject: false,
          isArray: false,
          isAtomic: true,
          name: 'id',
          isOptional: false
        });
      }
    }
  }
  /*else {
   // type unknown or unsupported... just map to 'any'...
   typespec.tsType = 'any';
   }*/

  // Since Mustache does not provide equality checks, we need to do the case distinction via explicit booleans
  typespec.isRef = typespec.tsType === 'ref';
  typespec.isObject = typespec.tsType === 'object';
  typespec.isArray = typespec.tsType === 'array';
  typespec.isAtomic = typespec.isAtomic || _.includes(['string', 'number', 'boolean', 'any'], typespec.tsType);

  return typespec;
}

const getViewForSwagger2 = function (opts, type) {
  let swagger = opts.swagger;
  let authorizedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'COPY', 'HEAD', 'OPTIONS', 'LINK', 'UNLIK', 'PURGE', 'LOCK', 'UNLOCK', 'PROPFIND'];
  let data = {
    isNode: type === 'node' || type === 'react',
    isES6: opts.isES6 || type === 'react',
    description: swagger.info.description,
    isSecure: swagger.securityDefinitions !== undefined,
    moduleName: opts.moduleName,
    className: opts.className,
    imports: opts.imports,
    domain: (swagger.schemes && swagger.schemes.length > 0 && swagger.host && swagger.basePath) ? swagger.schemes[0] + '://' + swagger.host + swagger.basePath.replace(/\/+$/g, '') : '',
    methods: [],
    definitions: [],
    enumerations: []
  };

  if (opts.customEndpoint) {
    data.domain = opts.customEndpoint.protocol + '//' + opts.customEndpoint.host;
  }

  _.forEach(swagger.paths, function (api, path) {
    let globalParams = [];

    /**
     * @param {Object} op - meta data for the request
     * @param {string} m - HTTP method name - eg: 'get', 'post', 'put', 'delete'
     */
    _.forEach(api, function (op, m) {
      if (m.toLowerCase() === 'parameters') {
        globalParams = op;
      }
    });

    _.forEach(api, function (op, m) {
      let M = m.toUpperCase();

      if (M === '' || authorizedMethods.indexOf(M) === -1) {
        return;
      }

      let secureTypes = [];

      if (swagger.securityDefinitions !== undefined || op.security !== undefined) {
        let mergedSecurity = _.merge([], swagger.security, op.security).map(function (security) {
          return Object.keys(security);
        });

        if (swagger.securityDefinitions) {
          for (let sk in swagger.securityDefinitions) {
            if (mergedSecurity.join(',').indexOf(sk) !== -1) {
              secureTypes.push(swagger.securityDefinitions[sk].type);
            }
          }
        }
      }

      //console.log('op for method', op);
      let responseModelName, modelRawName;

      if (op.operationId && op.operationId.indexOf('ResponseModel') > 0) {
        let operationIdDesc = op.operationId.split('-');

        if (operationIdDesc.length >= 2) {

          // has req/resp type annotations
          responseModelName = operationIdDesc[operationIdDesc.length - 1];

          modelRawName = responseModelName.replace('ResponseModel', '');

          operationIdDesc.pop(); // remove responseModelName from descriptor

          op.operationId = operationIdDesc.join('.');
        }
      }

      let methodName = op.operationId ? normalizeName(op.operationId) : getPathToMethodName(opts, m, path);
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
      };

      if (method.isSecure && method.isSecureToken) {
        data.isSecureToken = method.isSecureToken;
      }

      if (method.isSecure && method.isSecureApiKey) {
        data.isSecureApiKey = method.isSecureApiKey;
      }

      if (method.isSecure && method.isSecureBasic) {
        data.isSecureBasic = method.isSecureBasic;
      }

      let produces = op.produces || swagger.produces;

      if (produces) {
        method.headers.push({
          name: 'Accept',
          value: `'${produces.map(function (value) {
            return value;
          }).join(', ')}'`,
        });
      }

      let consumes = op.consumes || swagger.consumes;

      if (consumes) {
        method.headers.push({name: 'Content-Type', value: '\'' + consumes + '\''});
      }

      if (consumes === 'application/x-www-form-urlencoded') {
        method.mustFormPost = true;
      }

      let params = [];

      if (_.isArray(op.parameters)) {
        params = op.parameters;
      }

      params = params.concat(globalParams);

      const parameterCreate = function (parameter) {
        //Ignore parameters which contain the x-exclude-from-bindings extension
        if (parameter['x-exclude-from-bindings'] === true) {
          return;
        }

        // Ignore headers which are injected by proxies & app servers
        // eg: https://cloud.google.com/appengine/docs/go/requests#Go_Request_headers
        if (parameter['x-proxy-header'] && !data.isNode) {
          return;
        }

        if (_.isString(parameter.$ref)) {
          let segments = parameter.$ref.split('/');
          parameter = swagger.parameters[segments.length === 1 ? segments[0] : segments[2]];
        }

        if (parameter.enum && parameter.enum.length === 1) {
          parameter.isSingleton = true;
          parameter.singleton = parameter.enum[0];
        }

        if (parameter.in === 'body') {
          parameter.isBodyParameter = true;
        } else if (parameter.in === 'path') {
          parameter.isPathParameter = true;
        } else if (parameter.in === 'query') {
          if (parameter['x-name-pattern']) {
            parameter.isPatternType = true;
            parameter.pattern = parameter['x-name-pattern'];
          }
          parameter.isQueryParameter = true;
        } else if (parameter.in === 'header') {
          parameter.isHeaderParameter = true;
        } else if (parameter.in === 'formData') {
          parameter.isFormParameter = true;
        }

        parameter.camelCaseName = parameter.name;

        parameter.tsType = convertType(parameter);
        parameter.cardinality = parameter.required ? '' : '?';
        return parameter
      }

      const parameterAdd = (parameter) => {
        if( parameter.in === 'body' && parameter.schema){
            _.forIn(parameter.schema.properties, function(item, key){
              let paramToAdd = {
                name: key,
                in: 'body'
              }
              if(parameter.schema.required && parameter.schema.required.indexOf(key) !== -1 ){
                paramToAdd.required = true
              }
              _.forIn(item, function(val, name){
                paramToAdd[name] = val
              })

              method.parameters.push(parameterCreate(paramToAdd));
            });
        } else {
          return method.parameters.push(parameterCreate(parameter));
        }
      }

      _.forEach(params, parameterAdd);
      data.methods.push(method);
    });
  });

  _.forEach(swagger.definitions, function (definition, name) {
    // guards from generating internal model interfaces like "RepresentationModel"
    if (name.indexOf('ResponseModel') > 0) {
      let isModel = name.indexOf('Response') > 0,
        isRequestType = name.indexOf('Request') > 0;

      let modelPlainName = name.replace('Response', '');
      let modelRawName = modelPlainName.replace('Model', '');

      let hasIncluded = false,
        includedTypeDef = '',
        includedRelations = [];

      if (definition.additionalProperties && _.isArray(definition.additionalProperties)) {
        definition.additionalProperties.forEach(function (includedSpec) {
          let includedTypeName = includedSpec.split(':')[1],
            includeType = includedSpec.split(':')[0];

          if (includedTypeName && includedTypeName.indexOf('ResponseModel') > 0) {
            let plural = '';

            if (includeType === 'includes_many') {
              plural = 's';
            }

            hasIncluded = true;

            let includedTypeNameDef = 'I' + includedTypeName.replace('ResponseModel', 'ModelResponseData');

            if (includedTypeDef.length > 0) {
              includedTypeDef += '|';
            }

            includedTypeDef += includedTypeNameDef + '[]';

            includedRelations.push({
              includeKey: includedTypeName.replace('ResponseModel', '').toLowerCase() + plural,
              includeTypeDef: 'I' + includedTypeName.replace('ResponseModel', '') + (plural ? '[]' : '')
            })
          }
        });
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
      });
    }
  });

  let addedEnumerations = [];
  _.forEach(enumerations, function (enumeration) {
    // Ensure we only have one definition for every interface/enum because the same enum can be used in different
    // swagger paths
    if (addedEnumerations.indexOf(enumeration.tsType) > -1) {
      return; // it's the lodash version of "continue"
    }

    addedEnumerations.push(enumeration.tsType);
    data.enumerations.push(enumeration);
  });

  return data;
};

const getViewForSwagger1 = function (opts, type) {
  let swagger = opts.swagger;
  let data = {
    isNode: type === 'node' || type === 'react',
    isES6: opts.isES6 || type === 'react',
    description: swagger.description,
    moduleName: opts.moduleName,
    className: opts.className,
    domain: swagger.basePath ? swagger.basePath : '',
    methods: []
  };

  swagger.apis.forEach(function (api) {
    api.operations.forEach(function (op) {
      if (op.method === 'OPTIONS') {
        return;
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
      };

      if (op.produces) {
        let headers = [];

        headers.value = [];
        headers.name = 'Accept';
        headers.value.push(op.produces.map(function (value) {
          return '\'' + value + '\'';
        }).join(', '));
        method.headers.push(headers);
      }

      op.parameters = op.parameters ? op.parameters : [];
      op.parameters.forEach(function (parameter) {
        parameter.camelCaseName = _.camelCase(parameter.name);
        if (parameter.enum && parameter.enum.length === 1) {
          parameter.isSingleton = true;
          parameter.singleton = parameter.enum[0];
        }
        if (parameter.paramType === 'body') {
          parameter.isBodyParameter = true;
        } else if (parameter.paramType === 'path') {
          parameter.isPathParameter = true;
        } else if (parameter.paramType === 'query') {
          if (parameter['x-name-pattern']) {
            parameter.isPatternType = true;
            parameter.pattern = parameter['x-name-pattern'];
          }
          parameter.isQueryParameter = true;
        } else if (parameter.paramType === 'header') {
          parameter.isHeaderParameter = true;
        } else if (parameter.paramType === 'form') {
          parameter.isFormParameter = true;
        }
      });

      data.methods.push(method);
    });
  });

  return data;
};

const getCode = function (opts, type) {
  // For Swagger Specification version 2.0 value of field 'swagger' must be a string '2.0'
  let data = opts.swagger.swagger === '2.0' ? getViewForSwagger2(opts, type) : getViewForSwagger1(opts, type);

  if (type === 'custom') {
    if (!_.isObject(opts.template) || !_.isString(opts.template.class) || !_.isString(opts.template.method)) {
      throw new Error('Unprovided custom template. Please use the following template: template: { class: "...", method: "...", request: "..." }');
    }
  } else {
    if (!_.isObject(opts.template)) {
      opts.template = {};
    }

    let templates = __dirname + '/../templates/';
    opts.template.class = opts.template.class || fs.readFileSync(templates + type + '-class.mustache', 'utf-8');
    opts.template.method = opts.template.method || fs.readFileSync(templates + (type === 'typescript' ? 'typescript-' : '') + 'method.mustache', 'utf-8');

    if (type === 'typescript') {
      opts.template.type = opts.template.type || fs.readFileSync(templates + 'type.mustache', 'utf-8');
    }
  }

  if (opts.mustache) {
    _.assign(data, opts.mustache);
  }

  let source = Mustache.render(opts.template.class, data, opts.template);
  let lintOptions = {
    node: type === 'node' || type === 'custom',
    browser: type === 'angular' || type === 'custom' || type === 'react',
    undef: true,
    strict: true,
    trailing: true,
    smarttabs: true,
    maxerr: 999
  };

  if (opts.esnext) {
    lintOptions.esnext = true;
  }

  if (type === 'typescript') {
    opts.lint = false;
  }

  if (opts.lint === undefined || opts.lint === true) {
    lint(source, lintOptions);
    lint.errors.forEach(function (error) {
      if (error.code[0] === 'E') {
        throw new Error(error.reason + ' in ' + error.evidence + ' (' + error.code + ')');
      }
    });
  }

  if (opts.beautify === undefined || opts.beautify === true) {
    return beautify(source, {indent_size: 4, max_preserve_newlines: 2});
  } else {
    return source;
  }
};

exports.CodeGen = {
  getTypescriptCode: function (opts) {
    if (opts.swagger.swagger !== '2.0') {
      throw 'Typescript is only supported for Swagger 2.0 specs.';
    }
    return getCode(opts, 'typescript');
  },
  getAngularCode: function (opts) {
    return getCode(opts, 'angular');
  },
  getNodeCode: function (opts) {
    return getCode(opts, 'node');
  },
  getReactCode: function (opts) {
    return getCode(opts, 'react');
  },
  getCustomCode: function (opts) {
    return getCode(opts, 'custom');
  }
};
