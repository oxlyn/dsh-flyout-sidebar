/**
 * classic JSX（jsxFactory: h）的类型支撑：把全局 JSX 命名空间桥接到
 * @types/react 的元素表，使 tsc 按运行时同款语义检查 JSX，并强制每个使用
 * JSX 的文件显式导入 `h`（漏导入会在类型检查期报 Cannot find name 'h'）。
 */
import type * as ReactNS from 'react'

declare global {
  namespace JSX {
    type Element = ReactNS.ReactElement
    type ElementType = ReactNS.ElementType
    type IntrinsicElements = ReactNS.JSX.IntrinsicElements
    interface ElementAttributesProperty extends ReactNS.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends ReactNS.JSX.ElementChildrenAttribute {}
    interface ElementClass extends ReactNS.JSX.ElementClass {}
  }
}
