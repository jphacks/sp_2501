// forge.config.js
module.exports = {
  packagerConfig: {},
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        // ==================================
        // 1. 메인 프로세스 설정 (index.ts)
        // ==================================
        mainConfig: {
          entry: './src/index.ts',
          module: {
            rules: [
              {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: {
                  loader: 'ts-loader',
                  options: {
                    transpileOnly: true,
                  },
                },
              },
            ],
          },
          resolve: {
            extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
          },
        },
        // ==================================
        // 2. 렌더러 설정 (preload.ts)
        // ==================================
        renderer: {
          config: {
            module: {
              rules: [
                {
                  test: /\.tsx?$/,
                  exclude: /node_modules/,
                  use: {
                    loader: 'ts-loader',
                    options: {
                      transpileOnly: true,
                    },
                  },
                },
              ],
            },
            resolve: {
              extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
            },
          },
          entryPoints: [
            {
              name: 'main_window',
              preload: {
                js: './src/preload.ts',
              },
            },
          ],
        },
      },
    },
  ],
};