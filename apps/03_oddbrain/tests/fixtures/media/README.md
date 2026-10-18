# Legacy Word regression fixture

`word97.doc` is `__tests__/data/test05.doc` from [morungos/node-word-extractor](https://github.com/morungos/node-word-extractor), distributed under the included MIT license. It contains the sentence “This is a simple file created with Word 97-SR2.” It is exercised by `npm run test:media:native` through the built isolated decoder, not by a mocked extraction result.

The native check generates PDF, raster, XLS, XLSB, ODS and FODS inputs in memory. Its OCR uses bundled language data without model downloads. No provider keys or network are needed.
