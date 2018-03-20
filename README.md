![](https://img.shields.io/npm/v/swagger-jsonapi-codegen.svg) ![](https://img.shields.io/npm/dt/swagger-jsonapi-codegen.svg) [![Open Source Love](https://badges.frapsoft.com/os/v3/open-source.svg?v=102)](https://github.com/renepardon/swagger-jsonapi-codegen)

[![NPM](https://nodei.co/npm/swagger-jsonapi-codegen.png?downloads=true&downloadRank=true)](https://www.npmjs.com/package/swagger-jsonapi-codegen/)

---

# Swagger JSONAPI codegen

Generates valid Angular 4/5 (Typescript) API client file from Swagger documentation with Observables instead of Promises. The lib folder from this package is based on the *swagger-js-codegen*.

Example usage in your own package.json scripts section:

    "swagger-codegen": "node ./node_modules/ts-node/dist/bin.js ./node_modules/swagger-jsonapi-codegen/build-typescript.js -i ./documentation/build/swagger.json -o ./src/app/api/"

Where **-i** points to a valid swagger.json documentation and **-o** to a directory to save the client into. For all available options have a look at the **build-typescript.js** file.

CLI Options
```
  Usage: build-typescript [options]


  Options:

    -i, --input [path]        The file to use
    -o, --output_path [path]  The output for the api ts to be placed
    -n, --output_name [name]  Defaults to the api_<version>.ts
    -u, --url_base [url]      The base path to the api, overrides the path in the swagger. EG: -u https://www.yourdomain.com
    -h, --help                output usage information

```