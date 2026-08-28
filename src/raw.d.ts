/**
 * tsdown 构建期的 `?raw` 导入：把任意源文件内联为字符串常量
 * （见 tsdown.config.ts 的 rawInline 插件）。
 */
declare module '*?raw' {
  const content: string
  export default content
}
