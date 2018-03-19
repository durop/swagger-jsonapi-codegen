const normalizeName = require('./normalizeName')

// Contains all collected enumerations from swagger documentation
let enumerations          = []
let enumerationsNameCache = []

/**
 * Generates a unique enum name for potential Interfaces
 * @param name
 * @param counter
 * @returns {*}
 */
const generateEnumName = (name, counter) => {
  if (!name) {
    name = 'IEnum' + enumerationsNameCache.length
  }
  else {
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
  }
  else {
    return name
  }
}

module.exports = generateEnumName