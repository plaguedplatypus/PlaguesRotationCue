const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

/**
 * @type {import("webpack").Configuration}
 */
module.exports = {
    context: path.resolve(__dirname, "src"),
    entry: {
        main: "./index.ts"
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        clean: true
    },
    devtool: false,
    mode: "development",
    externals: [
        "sharp",
        "canvas",
        "electron/common"
    ],
    performance: {
        hints: false,
    },
    resolve: {
        extensions: [".wasm", ".tsx", ".ts", ".mjs", ".jsx", ".js"]
    },
    module: {
        // The rules section tells webpack what to do with different file types when you import them from js/ts
        rules: [
            { test: /\.tsx?$/, loader: "ts-loader" },
            { test: /\.css$/, use: ["style-loader", "css-loader"] },
            {
                test: /\.(png|jpg|jpeg|gif|webp)$/,
                exclude: /\.data\.png$/,
                type: "asset/resource",
                generator: { filename: "[base]" }
            },
            {
                test: /\.(html|json)$/,
                exclude: /\.fontmeta\.json$/,
                type: "asset/resource",
                generator: { filename: "[base]" }
            },
            { test: /\.data\.png$/, loader: "alt1/imagedata-loader", type: "javascript/auto" },
            { test: /\.fontmeta\.json$/, loader: "alt1/font-loader" }
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "src/assets"),
                    to: "assets",
                },
            ],
        }),
    ],
};
