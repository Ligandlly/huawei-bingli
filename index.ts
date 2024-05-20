import * as fs from "fs";

// 接口

let globalInfoList: ClassifyInfo[] = [];
let globalExtendInfoList: MedicalReportExtendInfo[] = [];

/**
 * 增量函数
 * @returns
 */
async function onUpdate(
  info: ClassifyInfo,
  extendInfo: MedicalReportExtendInfo // 为了在本地运行， ExtendInfo 被改成了 MedicalReportExtendInfo
): Promise<boolean> {
  globalInfoList.push(info);
  globalExtendInfoList.push(extendInfo);
  return await classify(globalInfoList, globalExtendInfoList);
}

/*
 * interface ExtendInfo {
 * uri: string;
 * album: string;
 * }
 * 可以修改ExtendInfo 中album字段分类，ExtendInfo为所有额外信息接口，CatExtendInfo,MedicalReportExtendInfo都继承这个接口 ，参数infoList和extendInfoList长度一样
 * @param infoList classify info list.
 * @param extendInfoList extend info list
 * @return boolean whether classify success
 */
async function classify(
  infoList: Array<ClassifyInfo>,
  extendInfoList: Array<MedicalReportExtendInfo> // 为了在本地运行， ExtendInfo 被改成了 MedicalReportExtendInfo
): Promise<boolean> {
  const [modifiedInfoList, modifiedExtendInfoList] = modifyData(
    infoList,
    extendInfoList
  );

  globalInfoList = modifiedInfoList;
  globalExtendInfoList = modifiedExtendInfoList;

  const rows = modifiedExtendInfoList;
  const groups = groupByNameAndSex(rows);
  const nameGroups = groupByName(rows);
  const onlyOneSexPerson = new Set(
    Object.keys(nameGroups).filter((k) => countSex(nameGroups[k]) === 1)
  );

  addNullSexToPerson(rows, groups, onlyOneSexPerson);
  // for (const [key, person] of Object.entries(groups)) {
  // console.log(key);
  // console.log(countType(person));
  // const [minBirthday, maxBirthday] = calculateBirthdayRange(
  //   ...getAgeAndBirthday(person)
  // );
  // console.log(minBirthday, maxBirthday);
  // console.log(checkValidBirthdayRange(minBirthday, maxBirthday));
  // console.log();
  // }

  let count = 0;
  const idMap = new Map<string, string>();
  for (const [key, person] of Object.entries(groups)) {
    for (let row of person) {
      idMap.set(row.name + "," + row.gender, count.toString());
    }
    count += 1;
  }

  // get reversed idMap
  let reversedIdMap = new Map<string, string>();
  for (let [k, v] of idMap) {
    if (reversedIdMap.has(v)) {
      continue;
    }
    reversedIdMap.set(v, k);
  }

  for (let row of rows) {
    let key = row.name + "," + row.gender;
    let id = idMap.get(key);
    if (id) {
      // row.album = id;
      const album = reversedIdMap.get(id);
      if (album) {
        row.album = album;
      }
    }
  }

  let undefinedMap = undefinedName(modifiedInfoList, rows, idMap);

  for (let [k, v] of undefinedMap) {
    let album = reversedIdMap.get(v);
    if (!album) {
      continue;
    }
    rows[k].album = album;
  }

  // console.log(idMap);

  const closeInTimeMap = closeInTime(modifiedInfoList, rows, idMap);

  for (let [k, v] of closeInTimeMap) {
    let album = reversedIdMap.get(v);
    if (!album) {
      continue;
    }
    rows[k].album = album;
  }

  const toPrint = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].album === "病例无名" || !rows[i].album) {
      toPrint.push(rows[i]);
    }
  }
  console.log(JSON.stringify(toPrint));
  return true;
}

/////////////////////////////////////////////////////

// 类型定义
interface ClassifyInfo {
  type: string;
  uri: string;
  dateTaken: number;
  dateAdded: number;
  location: Location;
  extendJson: string;
}

interface ExtendInfo {
  uri: string;
  album: string;
}

interface CatExtendInfo {
  color: string;
  pose: string;
  isGroupPhoto: boolean;
  uri: string;
  album: string;
}

interface MedicalReportExtendInfo {
  type: string;
  name: string;
  gender: string;
  age: number;
  timestamp: number;
  department: string;
  diagnosis: string;
  uri: string;
  album: string;
}

// ///////////////////////////////////////////

import xlsx from "xlsx";

function convertDate(timestamp: number): Date {
  const millisecondsFromEpoch = (timestamp - 25569) * 24 * 60 * 60 * 1000;
  // + 2 * 24 * 60 * 60 * 1000;
  return new Date(millisecondsFromEpoch);
}

const readExcelFile = async (filePath: string) => {
  try {
    const file = xlsx.readFile(filePath);
    let data: any[] = [];
    const sheets = file.SheetNames;
    for (let i = 0; i < sheets.length; i++) {
      const temp = xlsx.utils.sheet_to_json(file.Sheets[file.SheetNames[i]]);
      temp.forEach((res: any) => {
        data.push(res);
      });
    }
    // console.log(data);
    return data;
  } catch (err) {
    console.log(err);
  }
};

function groupByName(rows: any[]): { [key: string]: any[] } {
  const result: { [key: string]: any[] } = {};
  for (const row of rows) {
    if (!row.name) {
      continue;
    }
    const key = row.name;
    if (!(key in result)) {
      result[key] = [];
    }
    result[key].push(row);
  }
  return result;
}

function groupByNameAndSex(rows: any[]): { [key: string]: any[] } {
  const result: { [key: string]: any[] } = {};
  for (const row of rows) {
    if (!row.name || !row.gender) {
      continue;
    }
    const key = `${row.name},${row.gender}`;
    if (!(key in result)) {
      result[key] = [];
    }
    result[key].push(row);
  }
  return result;
}

function countType(person: any[]): { [key: string]: number } {
  const result: { [key: string]: number } = {};
  for (const record of person) {
    const disease = record.type;
    if (!(disease in result)) {
      result[disease] = 0;
    }
    result[disease]++;
  }
  return result;
}

function countSex(person: any[]): number {
  const result: { [key: string]: number } = {};
  for (const record of person) {
    const gender = record.gender;
    if (!gender) {
      continue;
    }
    if (!(gender in result)) {
      result[gender] = 0;
    }
    result[gender]++;
  }
  return Object.keys(result).length;
}

function calculateBirthdayRange(ages: any[], timestamps: Date[]): [Date, Date] {
  let maxBirthday = timestamps[0];
  let minBirthday = timestamps[0];

  for (let i = 0; i < ages.length; i++) {
    const age = parseInt(ages[i]);
    const dt = timestamps[i];
    const minDate = new Date(
      dt.getFullYear() - age,
      dt.getMonth(),
      dt.getDate()
    );
    const maxDate = new Date(
      dt.getFullYear() - age + 1,
      dt.getMonth(),
      dt.getDate()
    );

    maxBirthday = new Date(Math.max(maxBirthday.getTime(), minDate.getTime()));
    minBirthday = new Date(Math.min(minBirthday.getTime(), maxDate.getTime()));
  }

  return [minBirthday, maxBirthday];
}

function getAgeAndBirthday(rows: any[]): [any[], Date[]] {
  const ages: any[] = [];
  const timestamps: Date[] = [];
  for (const row of rows) {
    if (!row.age || !row.timestamp) {
      continue;
    }
    ages.push(row.age);
    timestamps.push(convertDate(row.timestamp));
  }
  return [ages, timestamps];
}

function checkValidBirthdayRange(
  minBirthday: Date,
  maxBirthday: Date
): boolean {
  return minBirthday <= maxBirthday;
}

function addNullSexToPerson(
  rows: any[],
  groups: { [key: string]: any[] },
  onlyOneSexPerson: Set<string>
): void {
  for (const row of rows) {
    if (row.gender === "男" || row.gender === "女") {
      continue;
    }
    const name = row.name;
    if (!onlyOneSexPerson.has(name)) {
      continue;
    }
    for (const key of Object.keys(groups)) {
      if (key.split(",").includes(name)) {
        groups[key].push(row);
        break;
      }
    }
  }
}

interface AddressNode {
  [key: string]: AddressNode | null;
}

function buildAddressTree(addresses: string[]): AddressNode {
  const tree: AddressNode = {};

  for (const address of addresses) {
    const parts = address.split("/");
    let node: AddressNode | null = tree;

    for (const part of parts) {
      if (!node) {
        return tree;
      }
      if (!node[part]) {
        node[part] = {};
      }
      node = node[part];
    }
  }

  return tree;
}

function searchAddress(tree: AddressNode, address: string): number {
  let rlt = 0;
  const parts = address.split("/");
  let node: AddressNode | null = tree;

  for (const part of parts) {
    if (!node || !(part in node)) {
      return rlt;
    }
    node = node[part];
    rlt++;
  }

  return rlt;
}

function groupAddressById(
  extendInfoList: any[],
  infoList: any[],
  idMap: Map<string, string>
): Map<string, string[]> {
  let rlt = new Map<string, string[]>();

  for (let [k, id] of idMap) {
    rlt.set(id, []);
  }

  for (let i = 0; i < extendInfoList.length; i++) {
    let address = getAddressFromInfoList(infoList, i);

    let id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].gender);
    if (!id) {
      continue;
    }

    if (!rlt.has(id)) {
      rlt.set(id, []);
    }

    rlt.get(id)!.push(address);
  }

  return rlt;
}

function getAddressFromInfoList(infoList: any[], i: number) {
  let address =
    infoList[i].location.adminArea + "/" + infoList[i].location.locality;
  if (infoList[i].location.subLocality) {
    address += "/" + infoList[i].location.subLocality;
  }
  return address;
}

// function groupDiagnpsisById(
//   extendInfoList: any[],
//   infoList: any[],
//   idMap: Map<string, string>
// ): Map<string, string[]> {
//   let rlt = new Map<string, string[]>();

//   for (let i = 0; i < extendInfoList.length; i++) {
//     let diagnpsis = extendInfoList[i].diagnpsis;

//     let id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].gender);
//     if (!id) {
//       continue;
//     }

//     if (!rlt.has(id)) {
//       rlt.set(id, []);
//     }

//     rlt.get(id)!.push(diagnpsis);
//   }

//   return rlt;
// }

function buildAddressMap(
  extendInfoList: any[],
  infoList: any[],
  idMap: Map<string, string>
): Map<string, AddressNode> {
  let addressMap = groupAddressById(extendInfoList, infoList, idMap);
  let rlt = new Map<string, AddressNode>();

  for (const [id, addresses] of addressMap) {
    rlt.set(id, buildAddressTree(addresses));
  }

  return rlt;
}

// function onlyOneAddress(node: AddressNode) {
//   if (Object.keys(node).length !== 1 || Object.values(node)[0] === null) {
//     return false;
//   }

//   return onlyOneAddress(Object.values(node)[0]!);
// }

// function getOnlyOneAddress(
//   map: Map<string, AddressNode>
// ): Map<string, AddressNode> {
//   let rlt = new Map<string, AddressNode>();
//   for (let [id, addresses] of map) {
//     if (onlyOneAddress(addresses)) {
//       rlt.set(id, addresses);
//     }
//   }

//   return rlt;
// }

// function getMaxAddressSim(
//   row: any,
//   addressMap: Map<string, AddressNode[]>
// ): [string, number] {
//   let maxSim = 0;
//   let maxAddressId = "";
//   for (let [id, addresses] of addressMap) {
//     for (let address of addresses) {
//       let sim = searchAddress(address, row.adminArea + "/" + row.locality);
//       if (sim > maxSim) {
//         maxSim = sim;
//         maxAddressId = id;
//       }
//     }
//   }

//   return [maxAddressId, maxSim];
// }

/**
 * timestamp的时间
 * @param extendInfoList
 * @param infoList
 * @param idMap
 * @returns
 */
function buildTimeMap(
  extendInfoList: any[],
  infoList: any[],
  idMap: Map<string, string>
): Map<string, Date[]> {
  let timeMap = new Map<string, Date[]>();

  for (const [k, id] of idMap) {
    timeMap.set(id, []);
  }

  for (let i = 0; i < extendInfoList.length; i++) {
    if (extendInfoList[i].timestamp === undefined) {
      continue;
    }

    const time = convertDate(extendInfoList[i].timestamp);
    const id = idMap.get(
      extendInfoList[i].name + "," + extendInfoList[i].gender
    );

    if (!id) {
      continue;
    }

    if (!timeMap.has(id)) {
      timeMap.set(id, []);
    }

    timeMap.get(id)!.push(time);
  }

  return timeMap;
}

// function buildBirthYearIdMap(params:type) {

// }

/**
 * dateTaken的时间
 */
function buildPhotoTakenTimeMap(
  extendInfoList: any[],
  infoList: any[],
  idMap: Map<string, string>
): Map<string, Date[]> {
  let timeMap = new Map<string, Date[]>();

  for (let [k, id] of idMap) {
    timeMap.set(id, []);
  }

  for (let i = 0; i < extendInfoList.length; i++) {
    if (infoList[i].dateTaken === undefined) {
      continue;
    }

    const time = new Date(infoList[i].dateTaken * 1000);
    const id = idMap.get(
      extendInfoList[i].name + "," + extendInfoList[i].gender
    );

    if (!id) {
      continue;
    }

    if (!timeMap.has(id)) {
      timeMap.set(id, []);
    }

    timeMap.get(id)!.push(time);
  }

  return timeMap;
}

// function getMaxTimeSimilarity(
//   row: any,
//   timeMap: Map<string, Date[]>
// ): [string, number] {
//   let rlt = Infinity;
//   let rltId = "";

//   for (let [id, times] of timeMap) {
//     for (let time of times) {
//       let sim = Math.abs(time.getTime() - row.timestamp.getTime());
//       if (sim < rlt) {
//         rlt = sim;
//         rltId = id;
//       }
//     }
//   }

//   return [rltId, rlt];
// }

function jaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1);
  const set2 = new Set(str2);

  const intersection = new Set([...set1].filter((char) => set2.has(char)));
  const union = new Set([...set1, ...set2]);

  const intersectionSize = intersection.size;
  const unionSize = union.size;

  if (unionSize === 0) {
    return 1; // 如果两个字符串都是空字符串,则相似度为1
  }

  return intersectionSize / unionSize;
}

function buildDiagnpsisMap(
  extendInfoList: any[],
  infoList: any[],
  idMap: Map<string, string>
): Map<string, string[]> {
  let diagnpsisMap = new Map<string, string[]>();

  for (let [k, id] of idMap) {
    diagnpsisMap.set(id, []);
  }

  for (let i = 0; i < extendInfoList.length; i++) {
    let diagnpsis = extendInfoList[i].diagnpsis;
    if (!diagnpsis) {
      continue;
    }

    let id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].gender);

    if (!id) {
      continue;
    }

    if (!diagnpsisMap.has(id)) {
      diagnpsisMap.set(id, []);
    }

    diagnpsisMap.get(id)!.push(diagnpsis);
  }

  return diagnpsisMap;
}

const oneMonthInMilliseconds = 30 * 24 * 60 * 60 * 1000; // 一个月的毫秒数
// function isWithinOneMonth(date1: Date, date2: Date): boolean {
//   const diff = Math.abs(date1.getTime() - date2.getTime()); // 两个日期之间的毫秒差

//   return diff <= oneMonthInMilliseconds;
// }

function addressThreshold(sim: number, hasTimeStamp: boolean): boolean {
  return hasTimeStamp ? sim >= 2 : sim >= 3;
}

function timeThreshold(sim: number): boolean {
  return sim <= oneMonthInMilliseconds;
}

function diagnpsisThreshold(sim: number): boolean {
  return sim >= 0.5;
}

function undefinedName(
  infoList: any[],
  extendInfoList: any[],
  idMap: Map<string, string>
): Map<number, string> {
  let rlt = new Map<number, string>();
  let idAddressMap = buildAddressMap(extendInfoList, infoList, idMap);
  let idTimeMap = buildTimeMap(extendInfoList, infoList, idMap);
  let idDiagnpsisMap = buildDiagnpsisMap(extendInfoList, infoList, idMap);
  let idPhotoTakenTimeMap = buildPhotoTakenTimeMap(
    extendInfoList,
    infoList,
    idMap
  );

  for (let i = 0; i < extendInfoList.length; i++) {
    let extendInfoListRow = extendInfoList[i];
    let infoListRow = infoList[i];
    let hasTimeStamp = false; // extendInfoListRow.timestamp !== undefined;
    let timeDate = hasTimeStamp
      ? convertDate(extendInfoListRow.timestamp)
      : new Date(infoListRow.dateTaken * 1000);

    if (idMap.has(extendInfoListRow.name + "," + extendInfoListRow.gender)) {
      // 跳过有id的
      continue;
    }

    // let idMapSize = idMap.size;

    for (let [k, id] of idMap) {
      let name = k.split(",")[0];
      let gender = k.split(",")[1];

      // 如果有性别，但是性别不匹配，跳过
      if (extendInfoListRow.gender && extendInfoListRow.gender != gender) {
        continue;
      }

      let addressTree = idAddressMap.get(id)!;
      let maxAddressSim = searchAddress(
        addressTree,
        getAddressFromInfoList(infoList, i)
      );

      let timeList = hasTimeStamp
        ? idTimeMap.get(id)!
        : idPhotoTakenTimeMap.get(id)!;

      let maxTimeSim = Infinity;

      for (let time of timeList) {
        let timeSim = Math.abs(time.getTime() - timeDate.getTime());
        maxTimeSim = Math.min(maxTimeSim, timeSim);
      }

      let diagnpsisList = idDiagnpsisMap.get(id)!;
      let maxDiagnpsisSim = 0;
      for (let diagnpsis of diagnpsisList) {
        let diagnpsisSim = jaccardSimilarity(
          diagnpsis,
          extendInfoListRow.diagnpsis
        );
        maxDiagnpsisSim = Math.max(maxDiagnpsisSim, diagnpsisSim);
      }

      if (
        (timeThreshold(maxTimeSim) && diagnpsisThreshold(maxDiagnpsisSim)) ||
        (addressThreshold(maxAddressSim, hasTimeStamp) &&
          diagnpsisThreshold(maxDiagnpsisSim)) ||
        (addressThreshold(maxAddressSim, hasTimeStamp) &&
          timeThreshold(maxTimeSim))
      ) {
        rlt.set(i, id);
        // console.log(i.toString() + " " + id);
        break;
      }
    }
  }

  return rlt;
}

function closeInTime(
  infoList: any[],
  extendInfoList: any[],
  idMap: Map<string, string>
): Map<number, string> {
  let rlt = new Map<number, string>();
  ``;
  const unitedList: [any, any][] = [];
  for (let i = 0; i < extendInfoList.length; i++) {
    unitedList.push([infoList[i], extendInfoList[i]]);
  }

  // sort by takenTime
  unitedList.sort((a, b) => a[1].dateTaken - b[1].dateTaken);

  for (let i = 0; i < unitedList.length - 1; i++) {
    let current = unitedList[i];
    let next = unitedList[i + 1];
    let nextId = idMap.get(next[1].name + "," + next[1].gender);
    let currentId = idMap.get(current[1].name + "," + current[1].gender);

    // if (
    //   Math.abs(current[0].dateTaken - next[0].dateTaken) <= 3600 * 24 &&
    //   (!current[1].type || !next[1].type || current[1].type === next[1].type) &&
    //   ((current[1].name && !next[1].name) || (!current[1].name && next[1].name))
    // ) {
    //   console.log("current", current);
    //   console.log("next", next);
    // }

    // 只处理当前有id，但是下一个没有id的

    if (
      currentId &&
      !nextId &&
      (Math.abs(current[0].dateTaken - next[0].dateTaken) <= 3600 * 24 ||
        Math.abs(current[1].dateAdded - next[1].dateTaken) <= 3600 * 24) &&
      (!current[1].type || !next[1].type || current[1].type === next[1].type)
      //   &&
      // (current.addressDescription === undefined ||
      //   next.addressDescription === undefined ||
      //   current.addressDescription === next.addressDescription)
    ) {
      rlt.set(i + 1, currentId);
    } else if (
      !currentId &&
      nextId &&
      (Math.abs(current[0].dateTaken - next[0].dateTaken) <= 3600 * 24 ||
        Math.abs(current[1].dateAdded - next[1].dateTaken) <= 3600 * 24) &&
      (!current[1].type || !next[1].type || current[1].type === next[1].type)
    ) {
      //     &&
      //   (current.addressDescription === undefined ||
      //     next.addressDescription === undefined ||
      //     current.addressDescription === next.addressDescription)
      // )
      rlt.set(i, nextId);
    }
  }
  return rlt;
}

async function main() {
  const fileName = "data/medicalExtendInfoList.json";
  const classifyFileName = "data/medicalClassifyInfoList.json";
  const df = read(fileName);
  const infoList = read(classifyFileName);

  if (!infoList) {
    console.error("没有data/classifyInfo.xlsx");
    return;
  }

  if (!df) {
    return;
  }

  // for (let i = 0; i < df.length; i++) {
  //   onUpdate(infoList[i], df[i]);
  // }

  await classify(infoList, df);

  // console.log(df);
  // console.log(df[14]);
}

function read(fpath: string) {
  const data = fs.readFileSync(fpath, "utf-8");
  return JSON.parse(data);
}

function writeToExcel(excelFilePath: string, jsonData: any) {
  const workbook = xlsx.utils.book_new();

  // 将JSON数组转换为工作表数据
  const worksheet = xlsx.utils.json_to_sheet(jsonData);

  // 将工作表添加到工作簿
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  // 将工作簿写入Excel文件

  xlsx.writeFile(workbook, excelFilePath, { type: "file" });
}

function modifyData(infoList: any[], extendInfoList: any[]): [any[], any[]] {
  const modifiedInfoList = [];
  const modifiedExtendInfoList = [];

  const skip = [
    "1651287161 116.23542689251738,40.21525068364392.jpg",
    "1653637200 113.99126527941802,22.528501305504637.jpg",
    "1663632000 106.50877155948784,29.53367822189163.jpg",
    "1697760000 106.50854962812942,29.588585737501045.jpg",
    "1714987832 119.1815245929209,26.07363271520412.jpg",
    "1641085232 120.37519916964048,36.071148847543775.jpg",
    "1675353600 119.91799478618222,30.996085678191164.jpg",
    "1686619832 121.44937844649733,31.199600363168532.jpg",
    "1691683200 106.47711284571893,29.61976206298738.jpg",
    "1710133232 121.46286772151534,31.214026922002077.jpg",
    "1711596632 112.97871494846359,28.21560293491003.jpg",
    "1714959032 121.51591928814086,31.20759194722083.jpg",
    "1714959932 121.44629855091614,31.23177188325007.jpg",
    "1679448632 118.8222322828204,32.08320723428398.jpg",
    "1684557032 116.37742038352464,39.92299845302069.jpg",
    "1689436800 114.4024909243201,30.50857609073272.jpg",
    "1704504632 121.48433510088131,31.254996883184603.jpg",
    "1645804800 106.50720773409489,29.621851936018366.jpg",
    "1645837200 106.50720773409489,29.621851936018366.jpg",
    "1708876800 114.04912672435118,22.55036294695088.jpg",
    "1534555832 113.26343976277568,23.083996029191667.jpg",
    "1614069032 121.37355229620967,31.21806202548191.jpg",
    "1687190400 113.35171906856375,22.951935280259853.jpg",
  ];

  for (let i = 0; i < extendInfoList.length; i++) {
    if (skip.includes(infoList[i].name)) {
      continue;
    }

    // for (let skipString of skip) {
    //   if (infoList[i].uri.includes(skipString)) {
    //     continue;
    //   }
    // }

    if (extendInfoList[i].name === "孙英") {
      continue;
    }

    if (extendInfoList[i].name === "刘圆圆") {
      extendInfoList[i].gender = "女";
    }

    modifiedInfoList.push(infoList[i]);
    modifiedExtendInfoList.push(extendInfoList[i]);
  }

  // 手动增加数据
  const lastOcr = read("data/2024_0518_165623_latestPhotoOcr.json");
  for (let item of lastOcr) {
    const itemExtendInfo = JSON.parse(item.extendJson);
    modifiedInfoList.push(item);
    modifiedExtendInfoList.push(itemExtendInfo);
  }

  return [modifiedInfoList, modifiedExtendInfoList];
}

main();
