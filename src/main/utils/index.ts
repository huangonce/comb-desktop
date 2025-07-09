export const parseLocation = (
  location: string
): {
  country: string
  province: string
  city: string
  district: string
} => {
  if (!location) {
    return { country: '', province: '', city: '', district: '' }
  }

  // 简单的位置解析逻辑
  const parts = location.split(/[,，\s]+/).filter((part) => part.trim())

  let country = ''
  let province = ''
  let city = ''
  let district = ''

  if (parts.length >= 1) {
    country = parts[0].includes('China') || parts[0].includes('中国') ? '中国' : parts[0]
  }
  if (parts.length >= 2) {
    province = parts[1]
  }
  if (parts.length >= 3) {
    city = parts[2]
  }
  if (parts.length >= 4) {
    district = parts[3]
  }

  return { country, province, city, district }
}

export const extractPhone = (text: string): string => {
  if (!text) return ''

  const phoneMatch = text.match(/(\+?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4})/g)
  return phoneMatch ? phoneMatch[0] : ''
}

export const parseYear = (yearText: string): string => {
  if (!yearText) return ''

  const yearMatch = yearText.match(/(\d{4})/)
  return yearMatch ? yearMatch[1] : ''
}

export const extractEmail = (text: string): string => {
  if (!text) return ''

  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)
  return emailMatch ? emailMatch[0] : ''
}
