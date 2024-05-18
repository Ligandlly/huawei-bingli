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
    globalInfoList = infoList;
    globalExtendInfoList = extendInfoList;

    const rows = extendInfoList;
    const groups = groupByNameAndSex(rows);
    const nameGroups = groupByName(rows);
    const onlyOneSexPerson = new Set(
        Object.keys(nameGroups).filter((k) => countSex(nameGroups[k]) === 1)
    );

    addNullSexToPerson(rows, groups, onlyOneSexPerson);
    for (const [key, person] of Object.entries(groups)) {
        // console.log(key);
        // console.log(countType(person));
        const [minBirthday, maxBirthday] = calculateBirthdayRange(
            ...getAgeAndBirthday(person)
        );
        // console.log(minBirthday, maxBirthday);
        // console.log(checkValidBirthdayRange(minBirthday, maxBirthday));
        // console.log();
    }

    let count = 0;
    const idMap = new Map<string, string>();
    for (const [key, person] of Object.entries(groups)) {
        for (let row of person) {
            idMap.set(row.name + "," + row.sex, count.toString());
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
        let key = row.name + "," + row.sex;
        let id = idMap.get(key);
        if (id) {
            // row.album = id;
            const album = reversedIdMap.get(id);
            if (album) {
                row.album = album;
            }
        }
    }

    let undefinedMap = undefinedName(infoList, rows, idMap);

    for (let [k, v] of undefinedMap) {
        let album = reversedIdMap.get(v);
        if (!album) {
            continue;
        }
        extendInfoList[k].album = album;
    }

    // console.log(idMap);

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
    sex: string;
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
        if (!row.name || !row.sex) {
            continue;
        }
        const key = `${row.name},${row.sex}`;
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
        const sex = record.sex;
        if (!sex) {
            continue;
        }
        if (!(sex in result)) {
            result[sex] = 0;
        }
        result[sex]++;
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
        if (row.sex === "男" || row.sex === "女") {
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

        let id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].sex);
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
    let address = infoList[i].adminArea + "/" + infoList[i].locality;
    if (infoList[i].subLocality) {
        address += "/" + infoList[i].subLocality;
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

//     let id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].sex);
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
        const id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].sex);

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
        const id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].sex);

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

        let id = idMap.get(extendInfoList[i].name + "," + extendInfoList[i].sex);

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
        let hasTimeStamp = extendInfoListRow.timestamp !== undefined;
        let timeDate = hasTimeStamp
            ? convertDate(extendInfoListRow.timestamp)
            : new Date(infoListRow.dateTaken * 1000);

        if (idMap.has(extendInfoListRow.name + "," + extendInfoListRow.sex)) {
            // 跳过有id的
            continue;
        }

        // let idMapSize = idMap.size;

        for (let [k, id] of idMap) {
            let name = k.split(",")[0];
            let sex = k.split(",")[1];

            // 如果有性别，但是性别不匹配，跳过
            if (extendInfoListRow.sex && extendInfoListRow.sex != sex) {
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
    const unitedList = [];
    for (let i = 0; i < extendInfoList.length; i++) {
        unitedList.push({
            ...extendInfoList[i],
            ...infoList[i],
        });
    }

    // sort by takenTime
    unitedList.sort((a, b) => a.dateTaken - b.dateTaken);

    for (let i = 0; i < unitedList.length - 1; i++) {
        let current = unitedList[i];
        let next = unitedList[i + 1];
        let nextId = idMap.get(next.name + "," + next.sex);
        let currentId = idMap.get(current.name + "," + current.sex);

        // 只处理当前有id，但是下一个没有id的
        if (!currentId || nextId) {
            continue;
        }

        // 先转换成Date，再判断takenTime是否在一小时内
        const currentTakenTime = new Date(current.dateTaken * 1000);
        const nextTakenTime = new Date(next.dateTaken * 1000);
        const diff = Math.abs(currentTakenTime.getTime() - nextTakenTime.getTime());
        if (diff <= 3600 * 1000) {
            rlt.set(i + 1, currentId);
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


    console.log(df);
    console.log(df[14]);
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

    xlsx.writeFile(workbook, excelFilePath, {type: "file"});
}

main();
