"use strict";

// Three Jest projects per the implementation plan:
//  - components: React/DOM tests (jsdom)
//  - engine: pure translation/observer/model tests (node)
//  - webr-corpus: golden .R fixtures executed under real webR (node, serial)
// The webr-corpus project is intentionally present (and empty-passing) from the
// first PR so the CI shape is final before Unit 5 fills it in.

const shared = {
  preset: "ts-jest/presets/js-with-ts",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/__mocks__/fileMock.js",
    "\\.(css|less|sass|scss)$": "identity-obj-proxy",
  },
  testPathIgnorePatterns: ["/node_modules/", "/playwright/"],
};

module.exports = {
  coveragePathIgnorePatterns: ["/node_modules/", "src/utilities/test-utils.ts"],
  projects: [
    {
      ...shared,
      displayName: "components",
      testEnvironment: "jsdom",
      setupFilesAfterEnv: ["<rootDir>/src/test/setupTests.ts"],
      testMatch: ["<rootDir>/src/components/**/*.@(test|spec).@(ts|tsx)"],
    },
    {
      ...shared,
      displayName: "engine",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/src/@(translation|services|models|lib)/**/*.@(test|spec).ts",
      ],
    },
    {
      ...shared,
      displayName: "webr-corpus",
      testEnvironment: "node",
      testMatch: ["<rootDir>/scripts/**/*.@(test|spec).ts"],
    },
  ],
};
