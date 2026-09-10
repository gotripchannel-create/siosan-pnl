// Общие утилиты безопасности для serverless-функций (api/*.js).
// Вынесено в отдельный модуль, чтобы не дублировать в каждом файле по отдельности.

import { timingSafeEqual, createHash } from 'crypto';

// Обычное сравнение строк (===) может теоретически быть уязвимо к timing-атаке —
// злоумышленник, зная время сравнения, может побайтово подобрать секрет. Для
// внутреннего инструмента риск невысокий, но раз уж сравниваем секреты — делаем
// правильно. timingSafeEqual требует буферы ОДИНАКОВОЙ длины, поэтому сравниваем
// хэши фиксированной длины, а не сами строки напрямую.
export function timingSafeStringEqual(a, b) {
  const bufA = createHash('sha256').update(String(a || '')).digest();
  const bufB = createHash('sha256').update(String(b || '')).digest();
  return timingSafeEqual(bufA, bufB);
}
