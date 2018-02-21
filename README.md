# Swagger JSONAPI codegen

Generates valid Angular 4/5 (Typescript) API client file from Swagger documentation with Observables instead of Promises. The lib folder from this package is based on the swagger-js-codegen.

Example usage in your own package.json scripts section:

    "swagger-codegen": "node ./node_modules/ts-node/dist/bin.js ./node_modules/swagger-jsonapi-codegen/build-typescript.js -i ./documentation/build/swagger.json -o ./src/app/api/"