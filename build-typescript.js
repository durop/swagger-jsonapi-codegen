const fs = require('fs')
const path = require('path')
const CodeGen = require('./lib/Codegen').CodeGen
const program = require('commander')

program
  .option('-i, --input [path]', 'The file to use')
  .option('-o, --output_path [path]', 'The output for the api ts to be placed')
  .option('-n, --output_name [name]', 'Defaults to the api_<version>.ts')
  .option('-u, --url_base [url]', 'The base path to the api, overrides the path in the swagger')
  // TODO .option('-t, --template-class [name]', 'Path to custom class template')
  // TODO .option('-t, --template-method [name]', 'Path to custom method template')
  // TODO .option('-t, --template-type [name]', 'Path to custom type template')
  .parse(process.argv)

let swagger = JSON.parse(fs.readFileSync(program.input, 'UTF-8'))
let tsSourceCode = CodeGen.getTypescriptCode({
  className: 'Api',
  moduleName: 'Api',
  swagger: swagger,
  domainOverride: program.url_base || false,
  template: {
    'class': fs.readFileSync(path.join(__dirname, './templates/angular5/class.mustache'), 'utf-8'),
    'method': fs.readFileSync(path.join(__dirname, './templates/angular5/method.mustache'), 'utf-8'),
    'type': fs.readFileSync(path.join(__dirname, './templates/angular5/type.mustache'), 'utf-8')
  }
})

// Default the output name
if (!program.output_name) {
  program.output_name = 'api'
}

// Get the version from swagger.json/.yml and use this for the generated typescript file.
const fullName = program.output_name + '_' + swagger.info.version + '.ts'

// Finally write the file to desired destination folder.
fs.writeFileSync(path.join(program.output_path, fullName), tsSourceCode)
