const SCAN_NUTRIENTS = [
  {key:'calories',g:'calPer100',item:'calPerItem',label:'Cal'},
  {key:'protein',g:'proteinPer100',item:'proteinPerItem',label:'Prot'},
  {key:'carbs',g:'carbsPer100',item:'carbsPerItem',label:'Carb'},
  {key:'fat',g:'fatPer100',item:'fatPerItem',label:'Fat'},
  {key:'fiber',g:'fiberPer100',item:'fiberPerItem',label:'Fiber'},
  {key:'salt',g:'saltPer100',item:'saltPerItem',label:'Salt'}
];
function scanUnit(item){ return item.unit === 'item' ? 'item' : 'g'; }
function scanNumber(value){
  if(value === '' || value == null) return 0;
  const n = Number(String(value).trim().replace(',','.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function scanQuantity(item){ return scanNumber(scanUnit(item) === 'item' ? item.quantity : item.grams); }
function scanNutrition(item){
  const unit = scanUnit(item);
  return Object.fromEntries(SCAN_NUTRIENTS.map(field=>[field.key,scanNumber(item[field[unit]])]));
}
function scanWeight(item){ return scanNumber(item.itemWeightG); }
function convertScanNutrition(item,from,to,weight){
  const scale = from === 'g' ? weight/100 : 100/weight;
  for(const field of SCAN_NUTRIENTS){
    item[field[to]] = item[field[from]] === '' || item[field[from]] == null ? '' : scanNumber(item[field[from]])*scale;
  }
}
function setScanUnit(item,unit){
  if(unit === scanUnit(item)) return;
  if(unit === 'item'){
    if(!scanWeight(item) && scanNumber(item.grams)>0) item.itemWeightG = String(scanNumber(item.grams));
    const weight = scanWeight(item);
    if(weight){
      if(!item.perItemOrigin || item.perItemOrigin === 'converted'){
        convertScanNutrition(item,'g','item',weight);
        item.perItemOrigin = 'converted';
      }
      if(scanNumber(item.grams)>0) item.quantity = String(scanNumber(item.grams)/weight);
    } else if(!item.perItemOrigin){
      for(const field of SCAN_NUTRIENTS) item[field.item] = '';
    }
    if(item.quantity == null || item.quantity === '') item.quantity = '1';
  } else if(scanWeight(item)){
    item.grams = String(scanNumber(item.quantity)*scanWeight(item));
    if(item.calPer100 === '' || item.calPer100 == null) convertScanNutrition(item,'item','g',scanWeight(item));
  }
  item.unit = unit;
}
function setScanItemWeight(item,value){
  item.itemWeightG = value;
  const weight = scanWeight(item);
  if(weight){
    if(!item.perItemOrigin || item.perItemOrigin === 'converted'){
      convertScanNutrition(item,'g','item',weight);
      item.perItemOrigin = 'converted';
    } else convertScanNutrition(item,'item','g',weight);
  } else if(item.perItemOrigin === 'converted'){
    for(const field of SCAN_NUTRIENTS) item[field.item] = '';
    item.perItemOrigin = null;
  }
}
function setScanNutrient(item,field,value){
  const unit = scanUnit(item);
  item[field[unit]] = value;
  if(unit === 'item') item.perItemOrigin = 'entered';
  if(scanWeight(item)){
    const other = unit === 'g' ? 'item' : 'g';
    const number = Number(String(value).trim().replace(',','.'));
    item[field[other]] = value === '' || !Number.isFinite(number) || number < 0 ? '' : number*(unit === 'g' ? scanWeight(item)/100 : 100/scanWeight(item));
    if(unit === 'g') item.perItemOrigin = 'converted';
  }
}
function applyScanNutrition(item,result){
  const unit = scanUnit(item);
  for(const field of SCAN_NUTRIENTS) item[field[unit]] = result[field[unit]];
  item.perItemOrigin = unit === 'item' ? 'ai' : (scanWeight(item) ? 'converted' : null);
  const other = unit === 'g' ? 'item' : 'g';
  if(scanWeight(item)) convertScanNutrition(item,unit,other,scanWeight(item));
  else for(const field of SCAN_NUTRIENTS) item[field[other]] = '';
}
function scanTotals(items){
  const totals = {calories:0,protein:0,carbs:0,fat:0,fiber:0,salt:0,grams:0,items:0,hasPerItem:false};
  for(const item of items){
    const unit = scanUnit(item);
    const amount = scanQuantity(item);
    const scale = unit === 'item' ? amount : amount/100;
    const nutrition = scanNutrition(item);
    for(const field of SCAN_NUTRIENTS) totals[field.key] += nutrition[field.key]*scale;
    if(unit === 'item'){ totals.items += amount; totals.hasPerItem = true; }
    else totals.grams += amount;
  }
  return totals;
}
function scanValidationMessage(items){
  for(const item of items){
    if(scanQuantity(item)<=0) return 'Enter grams or item quantity for every food';
    const unit = scanUnit(item);
    if(unit === 'item' && item.itemWeightG !== '' && item.itemWeightG != null){
      const weight = Number(String(item.itemWeightG).trim().replace(',','.'));
      if(!Number.isFinite(weight) || weight <= 0) return 'Enter a positive item weight, or leave it blank';
    }
    if(item[SCAN_NUTRIENTS[0][unit]] === '' || item[SCAN_NUTRIENTS[0][unit]] == null) return 'Enter calories per '+(unit === 'item' ? 'item' : '100g')+' or ask AI';
    for(const field of SCAN_NUTRIENTS){
      const raw = item[field[unit]];
      if(raw === '' || raw == null) continue;
      const n = Number(String(raw).trim().replace(',','.'));
      if(!Number.isFinite(n) || n<0) return 'Nutrition values must be zero or greater';
    }
  }
  return '';
}
if(typeof module !== 'undefined' && module.exports){
  module.exports = {SCAN_NUTRIENTS,scanUnit,scanNumber,scanQuantity,scanNutrition,scanWeight,setScanUnit,setScanItemWeight,setScanNutrient,applyScanNutrition,scanTotals,scanValidationMessage};
}
