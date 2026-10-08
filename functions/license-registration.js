'use strict';

// 枠の確認と登録を同じトランザクションで行い、同時要求でも上限を守る。
async function registerDevice(db, ref, device, maxDevices) {
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return { valid: false };
    const data = doc.data();
    if (data.revoked) return { valid: false, reason: 'revoked' };
    // device無しの旧クライアントを維持する。
    if (!device) return { valid: true };
    const devices = Array.isArray(data.devices) ? data.devices : [];
    if (devices.includes(device)) return { valid: true };
    if (devices.length >= maxDevices) return { valid: false, reason: 'device_limit' };
    tx.update(ref, { devices: [...devices, device] });
    return { valid: true };
  });
}

module.exports = { registerDevice };
