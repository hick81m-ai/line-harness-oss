import { useState } from 'react';
import { getIdToken, getLineUserId } from '../lib/liff-auth.js';

const BASE = import.meta.env.VITE_API_BASE ?? '';
const FORM_ID = '49a84e34-831c-462c-b801-a30c44d46f57';
const SERIAL_IMAGE_URL = 'https://i.ibb.co/fdfrJ4tC/Chat-GPT-Image-2026-5-20-19-25-33.png';

const SYMPTOMS = [
  '電源が入らない',
  '充電ができない',
  '温かくならない',
  '振動がない/弱い',
  'ベルトの空気が入らない',
  '左右差がある',
  '異音がする',
  '破損・傷がある',
  'その他',
];

export default function Form() {
  const [serialNumber, setSerialNumber] = useState('');
  const [memberId, setMemberId] = useState('');
  const [memberName, setMemberName] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [address, setAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [receiptNo, setReceiptNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSerialImage, setShowSerialImage] = useState(false);

  function toggleSymptom(s: string) {
    setSymptoms(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  async function handleSubmit() {
    const errors: string[] = [];
    if (!serialNumber.trim()) errors.push('機器のシリアル番号');
    if (!memberId.trim()) errors.push('会員ID');
    if (!memberName.trim()) errors.push('お名前');
    if (symptoms.length === 0) errors.push('故障症状（1つ以上選択）');
    if (symptoms.includes('その他') && !otherText.trim()) errors.push('その他の症状の詳細');
    if (!postalCode.trim()) errors.push('郵便番号');
    if (!address.trim()) errors.push('住所');
    if (!recipientName.trim()) errors.push('宛名');
    if (!phone.trim()) errors.push('電話番号');

    if (errors.length > 0) {
      setError(`以下の項目を入力してください：\n・${errors.join('\n・')}`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const symptomText = symptoms.includes('その他')
        ? [...symptoms.filter(s => s !== 'その他'), `その他: ${otherText}`].join(', ')
        : symptoms.join(', ');

      const res = await fetch(`${BASE}/api/forms/${FORM_ID}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: getLineUserId(),
          idToken: getIdToken(),
          responses: {
            product_name: 'Shaken',
            serial_number: serialNumber.trim(),
            member_id: memberId.trim(),
            member_name: memberName.trim(),
            failure_description: symptomText,
            postal_code: postalCode.trim(),
            address: address.trim(),
            recipient_name: recipientName.trim(),
            phone: phone.trim(),
            remarks: remarks.trim(),
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        const id = data.data?.id ?? '';
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        setReceiptNo(`#${date}-${id.slice(0, 6).toUpperCase()}`);
        setSubmitted(true);
      } else {
        setError(data.error || '送信に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました。再度お試しください。');
    }
    setLoading(false);
  }

  if (submitted) return (
    <div className="p-8 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h2 className="text-xl font-bold text-green-600 mb-2">送信完了しました</h2>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 my-4 inline-block">
        <p className="text-xs text-gray-500 mb-1">受付番号</p>
        <p className="text-lg font-bold text-gray-800">{receiptNo}</p>
      </div>
      <p className="text-gray-500 text-sm mt-2">お問い合わせありがとうございます。<br />担当者よりご連絡いたします。</p>
    </div>
  );

  return (
    <div className="p-6 max-w-lg mx-auto pb-12">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-800">⚠️ こちらはShaken専用の故障申し込みフォームです。</p>
      </div>
      <h1 className="text-xl font-bold mb-6">故障/破損商品確認依頼</h1>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">故障製品</label>
          <div className="w-full border border-gray-200 rounded-lg p-3 text-sm bg-gray-50 text-gray-500">Shaken</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            機器のシリアル番号 <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-1">故障機本体にございますシリアル番号をご入力ください</p>
          <button
            type="button"
            onClick={() => setShowSerialImage(!showSerialImage)}
            className="text-xs text-green-600 underline mb-2 block"
          >
            {showSerialImage ? '▲ シリアル番号の場所を隠す' : '▼ シリアル番号の場所を確認する'}
          </button>
          {showSerialImage && (
            <img
              src={SERIAL_IMAGE_URL}
              alt="シリアル番号の場所について"
              className="w-full rounded-lg mb-2 border border-gray-200"
            />
          )}
          <input
            type="text"
            inputMode="text"
            className="w-full border border-gray-300 rounded-lg p-3 text-base"
            placeholder="例：SK1234567890"
            value={serialNumber}
            onChange={e => setSerialNumber(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            故障機ご購入いただいた会員ID <span className="text-red-500">*</span>
          </label>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
            <p className="text-xs text-red-700">⚠️ 必ずご購入いただいた会員IDを記入してください。IDが異なる場合は対応できません。</p>
          </div>
          <input
            type="text"
            inputMode="text"
            className="w-full border border-gray-300 rounded-lg p-3 text-base"
            placeholder="例：EA123456"
            value={memberId}
            onChange={e => setMemberId(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            お名前 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="text"
            className="w-full border border-gray-300 rounded-lg p-3 text-base"
            placeholder="例：山田 太郎"
            value={memberName}
            onChange={e => setMemberName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            故障症状 <span className="text-red-500">*</span>（複数選択可）
          </label>
          <div className="space-y-2">
            {SYMPTOMS.map(s => (
              <label key={s} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={symptoms.includes(s)}
                  onChange={() => toggleSymptom(s)}
                  className="w-4 h-4 accent-green-500"
                />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
          {symptoms.includes('その他') && (
            <textarea
              className="mt-2 w-full border border-gray-300 rounded-lg p-3 text-base"
              rows={3}
              placeholder="その他の症状を入力してください"
              value={otherText}
              onChange={e => setOtherText(e.target.value)}
            />
          )}
        </div>

        <div className="border-t pt-5">
          <h2 className="text-base font-bold mb-4">配送先住所情報</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号 <span className="text-red-500">*</span></label>
              <input type="text" inputMode="numeric" className="w-full border border-gray-300 rounded-lg p-3 text-base" placeholder="例：123-4567" value={postalCode} onChange={e => setPostalCode(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">住所 <span className="text-red-500">*</span></label>
              <input type="text" inputMode="text" className="w-full border border-gray-300 rounded-lg p-3 text-base" placeholder="例：東京都渋谷区〇〇1-2-3" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">宛名 <span className="text-red-500">*</span></label>
              <input type="text" inputMode="text" className="w-full border border-gray-300 rounded-lg p-3 text-base" placeholder="例：山田 太郎" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電話番号 <span className="text-red-500">*</span></label>
              <input type="tel" inputMode="tel" className="w-full border border-gray-300 rounded-lg p-3 text-base" placeholder="例：090-1234-5678" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          </div>{/* 配送先セクション終わり */}

        {/* 備考セクション：独立 */}
        <div className="border-t pt-5">
          <h2 className="text-base font-bold mb-4">備考</h2>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-3 text-base"
            rows={4}
            placeholder="その他ご連絡事項があればご記入ください"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
          />
        </div>

      </div>{/* space-y-5 終わり */}


      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm whitespace-pre-line">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-6 w-full bg-green-500 text-white py-4 rounded-lg font-bold text-sm disabled:opacity-50"
      >
        {loading ? '送信中...' : '送信する'}
      </button>
    </div>
  );
}
