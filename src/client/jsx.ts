/**
 * Client 侧：React 运行时桥 + classic JSX 工厂。
 *
 * DSH 通过 `window.__ModuleLoader__.load({ factory(require) })` 在运行时提供
 * React，bundle 内绝不 import react（类型标注经 `import type` 在编译期擦除）
 * —— 入口在 factory 里调用 initReact 注入。JSX 经 tsdown 配置
 * （transform.jsx.pragma）编译为 h(...)，Fragment 哨兵在 h 内转发到
 * React.Fragment。
 */
import type * as ReactNS from 'react'

/** 当前 React 运行时（ESM live binding，initReact 后对所有模块可见） */
export let React: typeof ReactNS

export function initReact(runtime: unknown): void {
  React = runtime as typeof ReactNS
}

/**
 * classic JSX 的 Fragment 哨兵：`<></>` 编译为 h(Fragment, …)，h 再转发到
 * React.Fragment。类型标注为 ExoticComponent，让 tsc 接受 <Fragment> 作为
 * JSX 元素类型；运行时值始终是 Symbol 哨兵。
 */
export const Fragment: ReactNS.ExoticComponent<{ children?: ReactNS.ReactNode }> = Symbol(
  'dsh-flyout-sidebar.Fragment',
) as unknown as ReactNS.ExoticComponent<{ children?: ReactNS.ReactNode }>

/** JSX 工厂：转发 React.createElement，并处理 Fragment 哨兵 */
export function h(
  type: ReactNS.ElementType | typeof Fragment,
  props: (ReactNS.Attributes & Record<string, unknown>) | null | undefined,
  ...children: ReactNS.ReactNode[]
): ReactNS.ReactElement {
  const resolved = (type === Fragment ? React.Fragment : type) as ReactNS.ElementType
  return React.createElement(resolved, (props ?? null) as ReactNS.Attributes | null, ...children)
}
