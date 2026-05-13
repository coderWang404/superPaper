let reporterOptions = {}
if (process.env.CI) {
  reporterOptions = {
    reporter: '/superpaper/node_modules/mocha-multi-reporters',
    'reporter-options': ['configFile=./test/mocha-multi-reporters.cjs'],
  }
}
const all = {
  require: 'test/setup.js',
  ...reporterOptions,
}

module.exports = all
