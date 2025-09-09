const db =require('../db')
const timeSlots = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00','15:30','16:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30','21:00'
];

async function setTakeOutCapacity() {
  try {
    await db.query('DELETE FROM takeout_capacity');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); 
    const dd = String(today.getDate()).padStart(2, '0');

    const localDate = `${yyyy}-${mm}-${dd}`;
    for (const slot of timeSlots) {
      await db.query(
        `INSERT INTO takeout_capacity (time_slot, max_capacity,date) VALUES ($1, $2, $3)`,
        [slot, 30,localDate]
      );
    }
    console.log('已設定外帶最大容量表');
  } catch (error) {
    console.error('設定外帶容量失敗:', error);
  }
}
module.exports = setTakeOutCapacity;