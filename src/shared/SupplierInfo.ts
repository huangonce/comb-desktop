export interface SupplierInfo {
  /** 供应商索引 */
  index: number
  /** 中文名称 */
  cnName: string
  /** 英文名称 */
  enName: string
  /** 阿里巴巴链接 */
  alibabaURL: string
  /** 电话 */
  phone: string
  /** 邮箱 */
  email: string
  /** 国家 */
  country: string
  /** 省份 */
  province: string
  /** 城市 */
  city: string
  /** 区域 */
  district: string
  /** 地址 */
  address: string
  /** 公司网址 */
  website: string
  /** 成立年份 */
  establishedYear: string
  /** 信用代码 */
  creditCode: string
  /** 公司类型 */
  companyType?: string
  /** 公司规模 */
  businessScope?: string
  /** 主营产品 */
  yearRange?: string
  /** 年营业额 */
  tradeCapacity?: string
}
