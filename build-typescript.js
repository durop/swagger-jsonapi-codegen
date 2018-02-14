const fs = require('fs');
const path = require('path');
const CodeGen = require('./lib/Codegen').CodeGen;
const program = require('commander');

program
  .option('-i, --input [path]', 'The file to use')
  .option('-p, --output_path [path]', 'The output for the api ts to be placed')
  .option('-n, --output_name [name]', 'Defaults to the api_<version>.ts')
  .parse(process.argv);

let swagger = JSON.parse(fs.readFileSync(program.input, 'UTF-8'));
let tsSourceCode = CodeGen.getTypescriptCode({
  className: 'Api',
  moduleName: 'Api',
  swagger: swagger,
  template: {
    'class': fs.readFileSync(path.join(process.cwd(), 'swagger-code-gen/templates/typescript/class.mustache'), 'utf-8'),
    'method': fs.readFileSync(path.join(process.cwd(), 'swagger-code-gen/templates/typescript/method.mustache'), 'utf-8'),
    'type': fs.readFileSync(path.join(process.cwd(), 'swagger-code-gen/templates/typescript/type.mustache'), 'utf-8')
  }
});

// Default the output name
if (!program.output_name) {
  program.output_name = 'api'
}

const fullName = program.output_name + '_' + swagger.info.version + '.ts';

fs.writeFileSync(path.join(program.output_path, fullName), tsSourceCode);
