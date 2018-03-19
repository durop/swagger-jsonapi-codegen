const getCode = require('./getCode')

exports.CodeGen = {
  getTypescriptCode: function (opts) {
    if (opts.swagger.swagger !== '2.0') {
      throw 'Typescript is only supported for Swagger 2.0 specs.'
    }
    return getCode(opts, 'typescript')
  },
  getAngularCode: function (opts) {
    return getCode(opts, 'angular')
  },
  getNodeCode: function (opts) {
    return getCode(opts, 'node')
  },
  getReactCode: function (opts) {
    return getCode(opts, 'react')
  },
  getCustomCode: function (opts) {
    return getCode(opts, 'custom')
  }
}
