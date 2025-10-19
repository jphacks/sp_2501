// forge.config.js
module.exports = {
  packagerConfig: {
    asar: true, // asar 압축 사용 (선택 사항, 권장)
    ignore: [
      '/venv\//', // 가상 환경 폴더 제외
      '/node_modules/', // node_modules는 Webpack이 처리하므로 제외
      '/\.vscode/',
    ],
    extraResource: [ 
        './backend', // backend/ 폴더 전체 포함
        './screenshot', // screenshot/ 폴더 포함
        './uploader_config.json', // 루트의 설정 파일 포함
        './user-settings.json' // (개발 중 생성되는 파일)
    ]
  },
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