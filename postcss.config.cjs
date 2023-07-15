module.exports = {
  plugins: [
    require('postcss-import'),
    require('postcss-preset-env')({
      stage: 1,
      browsers: ['>0.3%', 'Firefox ESR', 'not dead', 'not op_mini all'],
      features: {
        'custom-properties': {
          strict: false,
          warnings: false,
          preserve: true
        }
      }
    })
  ]
}
