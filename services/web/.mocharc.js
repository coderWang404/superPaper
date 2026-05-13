let reporterOptions = {}
if (process.env.CI && process.env.JUNIT_ROOT_SUITE_NAME) {
  reporterOptions = {
    reporter: '/superpaper/node_modules/mocha-multi-reporters',
    'reporter-options': ['configFile=./test/mocha-multi-reporters.js'],
  }
}
module.exports = reporterOptions
