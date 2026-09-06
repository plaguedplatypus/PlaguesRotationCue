const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  context: path.resolve(__dirname, "src"),
  entry: "./app.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "main.js",
    clean: true
  },
  devtool: false,
  resolve: {
    extensions: [".ts", ".js"]
  },
  externals: ["canvas", "electron/common", "sharp"],
  module: {
    rules: [
      { test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: ["style-loader", {loader: "css-loader", options: { url: false },},] },
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: "index.html", to: "index.html" },
        { from: "appconfig.json", to: "appconfig.json" },
        { from: "assets", to: "assets" }
      ]
    })
  ],
  devServer: {
    static: { directory: path.resolve(__dirname, "dist") },
    port: 8080,
    hot: true,
    client: { overlay: true }
  },
  performance: { hints: false }
};
