const fs = require('fs')
const path = require('path')
const CodeGen = require('./lib/Codegen').CodeGen
const program = require('commander')
const pwd = process.cwd()

program
  .option('-i, --input [path]', 'The file to use')
  .option('-o, --output_path [path]', 'The output for the api ts to be placed')
  .option('-n, --output_name [name]', 'Defaults to the api_<version>.ts')
  .option('-u, --url_host [url]', 'The host to the api, overrides the host in the swagger. EG: -u https://www.yourdomain.com')
  .option('--tpl_class [name]', 'Path to custom class template')
  .option('--tpl_method [name]', 'Path to custom method template')
  .option('--tpl_type [name]', 'Path to custom type template')
  .parse(process.argv)

let swagger = JSON.parse(fs.readFileSync(program.input, 'UTF-8'))

// set the template vars
let classTpl = path.join(__dirname, './templates/angular5/class.mustache')
if(program.tpl_class){
  classTpl = path.join(pwd, program.tpl_class)
}

let methodTpl = path.join(__dirname, './templates/angular5/method.mustache')
if(program.tpl_method){
  methodTpl = path.join(pwd, program.tpl_method)
}

let typeTpl = path.join(__dirname, './templates/angular5/type.mustache')
if(program.tpl_type){
  typeTpl = path.join(pwd, program.tpl_type)
}

let tsSourceCode = CodeGen.getTypescriptCode({
  className: 'Api',
  moduleName: 'Api',
  swagger: swagger,
  host: program.url_host || false,
  template: {
    'class': fs.readFileSync(classTpl, 'utf-8'),
    'method': fs.readFileSync(methodTpl, 'utf-8'),
    'type': fs.readFileSync(typeTpl, 'utf-8')
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
