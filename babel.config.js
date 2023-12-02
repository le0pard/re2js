// eslint-disable-next-line import/no-default-export
export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: ['defaults and fully supports es6-module', 'maintained node versions'],
        modules: 'auto',
        useBuiltIns: false,
        exclude: ['transform-parameters']
      }
    ]
  ],
  plugins: []
}
