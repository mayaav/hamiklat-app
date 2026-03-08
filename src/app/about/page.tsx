'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from '@phosphor-icons/react'

export default function AboutPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-5 py-4 flex items-center gap-3"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowRight size={20} />
        </button>
        <h1 className="text-base font-semibold text-gray-900">אודות המפה</h1>
      </div>

      <div className="px-5 py-6 flex flex-col gap-6 max-w-lg mx-auto">

        {/* How it works */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-900">איך המפה עובדת?</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            המקלט היא מפה קהילתית שמאגדת מידע על מיקומי מקלטים, ממ&quot;דים ומרחבים מוגנים ברחבי ישראל.
            המידע מגיע ממקורות ציבוריים ומדיווחים של משתמשים, ומוצג כמו שהוא — ללא עריכה מלאה.
          </p>
        </section>

        {/* Community data */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-900">מידע קהילתי</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            חלק מהמקומות נוספו ישירות על ידי משתמשים. מידע כזה מסומן כ&quot;דיווח קהילתי&quot; ועשוי להיות
            לא מלא, לא מעודכן, או לא מדויק. אנו ממליצים תמיד לאמת מידע לפני הגעה למקום.
          </p>
        </section>

        {/* Disclaimer */}
        <section className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-700">הגבלת אחריות</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            המפה היא כלי עזר קהילתי ואינה מהווה מידע רשמי. המידע המוצג עשוי להיות חלקי, לא מעודכן, או
            לא מדויק. יש לפעול תמיד לפי הנחיות פיקוד העורף ורשויות הביטחון. יוצרי האפליקציה אינם
            אחראים לנכונות, לזמינות, או לבטיחות של כל מקום המופיע במפה.
          </p>
        </section>

        {/* Safety note */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-900">בטיחות</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            במצב חירום, פעלו לפי הנחיות פיקוד העורף. האפליקציה יכולה לעזור לכם למצוא מיקום קרוב,
            אך אינה מחליפה מידע רשמי.
          </p>
          <a
            href="https://www.oref.org.il"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 underline underline-offset-2"
          >
            אתר פיקוד העורף ←
          </a>
        </section>

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center pt-2">
          המקלט · גרסה קהילתית · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
