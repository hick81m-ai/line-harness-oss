import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getIdToken, getLineUserId } from '../lib/liff-auth.js';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export default function Form() {
  const [searchParams] = useSearchParams();
  const formId = searchParams.get('id');
  const [form, setForm] = useState<any>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!formId) return;
    fetch(`${BASE}/api/forms/${formId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setForm(d.data); });
  }, [formId]);

  async function handleSubmit() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/api/forms/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: getLineUserId(),
          idToken: getIdToken(),
          responses: values,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || '送信に失敗しました');
      }
    } catch (e) {
      setError('送信に失敗しました');
    }
    setLoading(false);
  }

  if (!formId) return <div className="p-8 text-red-500">フォームIDが指定されていません</div>;
  if (!form) return <div className="p-8 text-gray-500">読み込み中...</div>;

  if (submitted) return (
    <div className="p-8 text-center">
      <div className="text-4xl mb-4">✅</div>
      <h2 className="text-xl font-bold text-green-600 mb-2">送信完了しました</h2>
      <p className="text-gray-500">お問い合わせありがとうございます。担当者よりご連絡いたします。</p>
    </div>
  );

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-6">{form.name}</h1>
      <div className="space-y-4">
        {form.fields.map((field: any) => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.description && (
              <p className="text-xs text-gray-500 mb-1">{field.description}</p>
            )}
            {field.type === 'textarea' ? (
              <textarea
                className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                rows={4}
                value={values[field.name] || ''}
                onChange={e => setValues({ ...values, [field.name]: e.target.value })}
              />
            ) : (
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                value={values[field.name] || ''}
                onChange={e => setValues({ ...values, [field.name]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-6 w-full bg-green-500 text-white py-3 rounded-lg font-bold text-sm disabled:opacity-50"
      >
        {loading ? '送信中...' : '送信する'}
      </button>
    </div>
  );
}
