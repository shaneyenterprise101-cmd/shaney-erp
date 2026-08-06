const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

export const sendSmartWhatsApp = async (phone, message) => {
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone) {
    alert('⚠️ No valid mobile number available!');
    return;
  }
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone;
  const encodedMsg = encodeURIComponent(message);

  // Check karein ki kya app Electron (Desktop) mein chal rahi hai
  const isDesktop = window.require && window.require('electron');

  if (isDesktop) {
    try {
      // Desktop par Baileys background API ke zariye bhejne ki koshish karein
      const res = await fetch(`${BACKEND_URL}/api/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, message: message })
      });
      if (res.ok) {
        alert('✅ WhatsApp message sent via Baileys background service!');
        return;
      }
    } catch (e) {
      console.warn("Baileys desktop background send failed, falling back to manual prompt:", e);
    }
  }

  // Mobile ya agar desktop par Baileys fail ho jaye, toh user se puch kar Normal ya Business WhatsApp open karein
  const useBusiness = window.confirm(
    "📱 Select WhatsApp App:\n\n[OK] -> WhatsApp Business\n[Cancel] -> Normal WhatsApp"
  );

  if (useBusiness) {
    window.open(`whatsappbusiness://send?phone=${formattedPhone}&text=${encodedMsg}`, '_blank');
  } else {
    window.open(`https://wa.me/${formattedPhone}?text=${encodedMsg}`, '_blank');
  }
};