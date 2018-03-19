const _ = require('lodash')

/**
 * @param id
 */
const normalizeName = function (id) {
    return _.camelCase(id.replace(/\.|\-|\{|\}/g, '_'))
}

module.exports = normalizeName