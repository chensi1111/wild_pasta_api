const db =require('../db')
const timeSlots = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];

async function setTimeSlotsCapacity() {
  await db.query('DELETE FROM time_slots_capacity WHERE date < CURRENT_DATE');
  const today = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 3);

  for(let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0,10); // YYYY-MM-DD
    
    // 檢查該日期是否已存在時段設定
    const result = await db.query('SELECT COUNT(*) as cnt FROM time_slots_capacity WHERE date = $1', [dateStr]);
    const cnt = parseInt(result.rows[0].cnt, 10);
     if(cnt === 0) {
      // 沒有資料，批次新增所有時段
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const ts of timeSlots) {
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(dateStr, ts, 48);
      }

      const queryText = `INSERT INTO time_slots_capacity (date, time_slot, max_capacity) VALUES ${values.join(',')}`;
      await db.query(queryText, params);
    }
  }
}
module.exports = setTimeSlotsCapacity;