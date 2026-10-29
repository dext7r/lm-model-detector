// 浏览器入口：把 lmfpd-sdk 打包为可直接 import 的 ESM
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

export { loadDetector, DEFAULT_DATA_URLS, Detector, generateChallenges, parseNumbers, buildRequest, requestSample } from 'lmfpd-sdk'
