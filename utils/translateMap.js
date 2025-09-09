const productMap = {
    pastaA: "狼嚎辣肉醬麵",
    pastaB: "火吻碳烤雞肉義大利麵",
    pastaC: "荒野蒜香培根麵",
    pastaD: "黑夜墨魚獵人麵",
    pastaE: "烈焰牛排奶油寬扁麵",
    pastaF: "月光蕈菇松露白醬麵",
    pastaG: "血色番茄獵人麵",
    pastaH: "狼群炙燒香腸辣麵",
    pastaI: "野莓鴨胸紅酒筆管麵",
    pastaJ: "煙燻鮭魚野林青醬麵",
    appetizerA: "狼牙洋蔥圈塔",
    appetizerB: "火山熔岩起司球",
    appetizerC: "焦土香料雞翅",
    appetizerD: "野狼抓痕薯條拼盤",
    appetizerE: "炭烤菇菇獵人串",
    appetizerF: "深林香料炸花枝",
    appetizerG: "熾燒辣味雞柳條",
    appetizerH: "迷途羔羊炸乳酪條",
    appetizerI: "炙焰火腿煙燻拼盤",
    appetizerJ: "烈焰辣味義式肉丸",
    dessertA: "焦土熔岩巧克力蛋糕",
    dessertB: "月影烤棉花糖布朗尼",
    dessertC: "森林野莓奶酪",
    dessertD: "炙焰香蕉冰淇淋盅",
    drinkA: "狼煙莓果氣泡飲",
    drinkB: "野性熱紅酒香料茶",
    drinkC: "月下奶酒拿鐵",
    drinkD: "炭火黑糖冷萃咖啡",
    drinkE: "血月石榴冰沙",
};
const themeMap = {
  birthday:"生日聚餐",
  anniversary:"紀念日聚餐",
  family:"家庭聚餐",
  friends:"朋友聚餐",
  business:"商務聚餐",
  date:"約會聚餐"
}
const getProductList = (list) => {
  return list
    .split(",") 
    .map(item => {
      const [code, qty] = item.split("_");
      const name = productMap[code]
      return `${name}*${qty}`;
    })
    .join("<br>");
};
const getThemeList = (theme) => {
  return themeMap[theme] || "未指定";
};
module.exports = {getProductList,getThemeList}