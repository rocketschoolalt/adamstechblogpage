// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
import { Tokenizer } from "./tokenizer.ts";
function digits(value, count = 2) {
    return String(value).padStart(count, "0");
}
function createLiteralTestFunction(value) {
    return (string)=>{
        return string.startsWith(value) ? {
            value,
            length: value.length
        } : undefined;
    };
}
function createMatchTestFunction(match) {
    return (string)=>{
        const result = match.exec(string);
        if (result) return {
            value: result,
            length: result[0].length
        };
    };
}
// according to unicode symbols (http://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table)
const defaultRules = [
    {
        test: createLiteralTestFunction("yyyy"),
        fn: ()=>({
                type: "year",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("yy"),
        fn: ()=>({
                type: "year",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("MM"),
        fn: ()=>({
                type: "month",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("M"),
        fn: ()=>({
                type: "month",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("dd"),
        fn: ()=>({
                type: "day",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("d"),
        fn: ()=>({
                type: "day",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("HH"),
        fn: ()=>({
                type: "hour",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("H"),
        fn: ()=>({
                type: "hour",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("hh"),
        fn: ()=>({
                type: "hour",
                value: "2-digit",
                hour12: true
            })
    },
    {
        test: createLiteralTestFunction("h"),
        fn: ()=>({
                type: "hour",
                value: "numeric",
                hour12: true
            })
    },
    {
        test: createLiteralTestFunction("mm"),
        fn: ()=>({
                type: "minute",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("m"),
        fn: ()=>({
                type: "minute",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("ss"),
        fn: ()=>({
                type: "second",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("s"),
        fn: ()=>({
                type: "second",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("SSS"),
        fn: ()=>({
                type: "fractionalSecond",
                value: 3
            })
    },
    {
        test: createLiteralTestFunction("SS"),
        fn: ()=>({
                type: "fractionalSecond",
                value: 2
            })
    },
    {
        test: createLiteralTestFunction("S"),
        fn: ()=>({
                type: "fractionalSecond",
                value: 1
            })
    },
    {
        test: createLiteralTestFunction("a"),
        fn: (value)=>({
                type: "dayPeriod",
                value: value
            })
    },
    // quoted literal
    {
        test: createMatchTestFunction(/^(')(?<value>\\.|[^\']*)\1/),
        fn: (match)=>({
                type: "literal",
                value: match.groups.value
            })
    },
    // literal
    {
        test: createMatchTestFunction(/^.+?\s*/),
        fn: (match)=>({
                type: "literal",
                value: match[0]
            })
    }, 
];
export class DateTimeFormatter {
    #format;
    constructor(formatString, rules = defaultRules){
        const tokenizer = new Tokenizer(rules);
        this.#format = tokenizer.tokenize(formatString, ({ type , value , hour12  })=>{
            const result = {
                type,
                value
            };
            if (hour12) result.hour12 = hour12;
            return result;
        });
    }
    format(date, options = {}) {
        let string = "";
        const utc = options.timeZone === "UTC";
        for (const token of this.#format){
            const type = token.type;
            switch(type){
                case "year":
                    {
                        const value = utc ? date.getUTCFullYear() : date.getFullYear();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value, 2).slice(-2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "month":
                    {
                        const value1 = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value1;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value1, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "day":
                    {
                        const value2 = utc ? date.getUTCDate() : date.getDate();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value2;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value2, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "hour":
                    {
                        let value3 = utc ? date.getUTCHours() : date.getHours();
                        value3 -= token.hour12 && date.getHours() > 12 ? 12 : 0;
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value3;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value3, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "minute":
                    {
                        const value4 = utc ? date.getUTCMinutes() : date.getMinutes();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value4;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value4, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "second":
                    {
                        const value5 = utc ? date.getUTCSeconds() : date.getSeconds();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value5;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value5, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "fractionalSecond":
                    {
                        const value6 = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
                        string += digits(value6, Number(token.value));
                        break;
                    }
                // FIXME(bartlomieju)
                case "timeZoneName":
                    {
                        break;
                    }
                case "dayPeriod":
                    {
                        string += token.value ? date.getHours() >= 12 ? "PM" : "AM" : "";
                        break;
                    }
                case "literal":
                    {
                        string += token.value;
                        break;
                    }
                default:
                    throw Error(`FormatterError: { ${token.type} ${token.value} }`);
            }
        }
        return string;
    }
    parseToParts(string) {
        const parts = [];
        for (const token of this.#format){
            const type = token.type;
            let value = "";
            switch(token.type){
                case "year":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,4}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                        }
                        break;
                    }
                case "month":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            case "narrow":
                                {
                                    value = /^[a-zA-Z]+/.exec(string)?.[0];
                                    break;
                                }
                            case "short":
                                {
                                    value = /^[a-zA-Z]+/.exec(string)?.[0];
                                    break;
                                }
                            case "long":
                                {
                                    value = /^[a-zA-Z]+/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "day":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "hour":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    if (token.hour12 && parseInt(value) > 12) {
                                        console.error(`Trying to parse hour greater than 12. Use 'H' instead of 'h'.`);
                                    }
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    if (token.hour12 && parseInt(value) > 12) {
                                        console.error(`Trying to parse hour greater than 12. Use 'HH' instead of 'hh'.`);
                                    }
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "minute":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "second":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "fractionalSecond":
                    {
                        value = new RegExp(`^\\d{${token.value}}`).exec(string)?.[0];
                        break;
                    }
                case "timeZoneName":
                    {
                        value = token.value;
                        break;
                    }
                case "dayPeriod":
                    {
                        value = /^(A|P)M/.exec(string)?.[0];
                        break;
                    }
                case "literal":
                    {
                        if (!string.startsWith(token.value)) {
                            throw Error(`Literal "${token.value}" not found "${string.slice(0, 25)}"`);
                        }
                        value = token.value;
                        break;
                    }
                default:
                    throw Error(`${token.type} ${token.value}`);
            }
            if (!value) {
                throw Error(`value not valid for token { ${type} ${value} } ${string.slice(0, 25)}`);
            }
            parts.push({
                type,
                value
            });
            string = string.slice(value.length);
        }
        if (string.length) {
            throw Error(`datetime string was not fully parsed! ${string.slice(0, 25)}`);
        }
        return parts;
    }
    /** sort & filter dateTimeFormatPart */ sortDateTimeFormatPart(parts) {
        let result = [];
        const typeArray = [
            "year",
            "month",
            "day",
            "hour",
            "minute",
            "second",
            "fractionalSecond", 
        ];
        for (const type of typeArray){
            const current = parts.findIndex((el)=>el.type === type);
            if (current !== -1) {
                result = result.concat(parts.splice(current, 1));
            }
        }
        result = result.concat(parts);
        return result;
    }
    partsToDate(parts) {
        const date = new Date();
        const utc = parts.find((part)=>part.type === "timeZoneName" && part.value === "UTC");
        const dayPart = parts.find((part)=>part.type === "day");
        utc ? date.setUTCHours(0, 0, 0, 0) : date.setHours(0, 0, 0, 0);
        for (const part of parts){
            switch(part.type){
                case "year":
                    {
                        const value = Number(part.value.padStart(4, "20"));
                        utc ? date.setUTCFullYear(value) : date.setFullYear(value);
                        break;
                    }
                case "month":
                    {
                        const value1 = Number(part.value) - 1;
                        if (dayPart) {
                            utc ? date.setUTCMonth(value1, Number(dayPart.value)) : date.setMonth(value1, Number(dayPart.value));
                        } else {
                            utc ? date.setUTCMonth(value1) : date.setMonth(value1);
                        }
                        break;
                    }
                case "day":
                    {
                        const value2 = Number(part.value);
                        utc ? date.setUTCDate(value2) : date.setDate(value2);
                        break;
                    }
                case "hour":
                    {
                        let value3 = Number(part.value);
                        const dayPeriod = parts.find((part)=>part.type === "dayPeriod");
                        if (dayPeriod?.value === "PM") value3 += 12;
                        utc ? date.setUTCHours(value3) : date.setHours(value3);
                        break;
                    }
                case "minute":
                    {
                        const value4 = Number(part.value);
                        utc ? date.setUTCMinutes(value4) : date.setMinutes(value4);
                        break;
                    }
                case "second":
                    {
                        const value5 = Number(part.value);
                        utc ? date.setUTCSeconds(value5) : date.setSeconds(value5);
                        break;
                    }
                case "fractionalSecond":
                    {
                        const value6 = Number(part.value);
                        utc ? date.setUTCMilliseconds(value6) : date.setMilliseconds(value6);
                        break;
                    }
            }
        }
        return date;
    }
    parse(string) {
        const parts = this.parseToParts(string);
        const sortParts = this.sortDateTimeFormatPart(parts);
        return this.partsToDate(sortParts);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0MC4wL2RhdGV0aW1lL2Zvcm1hdHRlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLlxuXG5pbXBvcnQge1xuICBDYWxsYmFja1Jlc3VsdCxcbiAgUmVjZWl2ZXJSZXN1bHQsXG4gIFJ1bGUsXG4gIFRlc3RGdW5jdGlvbixcbiAgVGVzdFJlc3VsdCxcbiAgVG9rZW5pemVyLFxufSBmcm9tIFwiLi90b2tlbml6ZXIudHNcIjtcblxuZnVuY3Rpb24gZGlnaXRzKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIsIGNvdW50ID0gMik6IHN0cmluZyB7XG4gIHJldHVybiBTdHJpbmcodmFsdWUpLnBhZFN0YXJ0KGNvdW50LCBcIjBcIik7XG59XG5cbi8vIGFzIGRlY2xhcmVkIGFzIGluIG5hbWVzcGFjZSBJbnRsXG50eXBlIERhdGVUaW1lRm9ybWF0UGFydFR5cGVzID1cbiAgfCBcImRheVwiXG4gIHwgXCJkYXlQZXJpb2RcIlxuICAvLyB8IFwiZXJhXCJcbiAgfCBcImhvdXJcIlxuICB8IFwibGl0ZXJhbFwiXG4gIHwgXCJtaW51dGVcIlxuICB8IFwibW9udGhcIlxuICB8IFwic2Vjb25kXCJcbiAgfCBcInRpbWVab25lTmFtZVwiXG4gIC8vIHwgXCJ3ZWVrZGF5XCJcbiAgfCBcInllYXJcIlxuICB8IFwiZnJhY3Rpb25hbFNlY29uZFwiO1xuXG5pbnRlcmZhY2UgRGF0ZVRpbWVGb3JtYXRQYXJ0IHtcbiAgdHlwZTogRGF0ZVRpbWVGb3JtYXRQYXJ0VHlwZXM7XG4gIHZhbHVlOiBzdHJpbmc7XG59XG5cbnR5cGUgVGltZVpvbmUgPSBcIlVUQ1wiO1xuXG5pbnRlcmZhY2UgT3B0aW9ucyB7XG4gIHRpbWVab25lPzogVGltZVpvbmU7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24odmFsdWU6IHN0cmluZyk6IFRlc3RGdW5jdGlvbiB7XG4gIHJldHVybiAoc3RyaW5nOiBzdHJpbmcpOiBUZXN0UmVzdWx0ID0+IHtcbiAgICByZXR1cm4gc3RyaW5nLnN0YXJ0c1dpdGgodmFsdWUpXG4gICAgICA/IHsgdmFsdWUsIGxlbmd0aDogdmFsdWUubGVuZ3RoIH1cbiAgICAgIDogdW5kZWZpbmVkO1xuICB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNYXRjaFRlc3RGdW5jdGlvbihtYXRjaDogUmVnRXhwKTogVGVzdEZ1bmN0aW9uIHtcbiAgcmV0dXJuIChzdHJpbmc6IHN0cmluZyk6IFRlc3RSZXN1bHQgPT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IG1hdGNoLmV4ZWMoc3RyaW5nKTtcbiAgICBpZiAocmVzdWx0KSByZXR1cm4geyB2YWx1ZTogcmVzdWx0LCBsZW5ndGg6IHJlc3VsdFswXS5sZW5ndGggfTtcbiAgfTtcbn1cblxuLy8gYWNjb3JkaW5nIHRvIHVuaWNvZGUgc3ltYm9scyAoaHR0cDovL3d3dy51bmljb2RlLm9yZy9yZXBvcnRzL3RyMzUvdHIzNS1kYXRlcy5odG1sI0RhdGVfRmllbGRfU3ltYm9sX1RhYmxlKVxuY29uc3QgZGVmYXVsdFJ1bGVzID0gW1xuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInl5eXlcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcInllYXJcIiwgdmFsdWU6IFwibnVtZXJpY1wiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInl5XCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJ5ZWFyXCIsIHZhbHVlOiBcIjItZGlnaXRcIiB9KSxcbiAgfSxcblxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcIk1NXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJtb250aFwiLCB2YWx1ZTogXCIyLWRpZ2l0XCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiTVwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwibW9udGhcIiwgdmFsdWU6IFwibnVtZXJpY1wiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcImRkXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJkYXlcIiwgdmFsdWU6IFwiMi1kaWdpdFwiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcImRcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcImRheVwiLCB2YWx1ZTogXCJudW1lcmljXCIgfSksXG4gIH0sXG5cbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJISFwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwiaG91clwiLCB2YWx1ZTogXCIyLWRpZ2l0XCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiSFwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwiaG91clwiLCB2YWx1ZTogXCJudW1lcmljXCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiaGhcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoe1xuICAgICAgdHlwZTogXCJob3VyXCIsXG4gICAgICB2YWx1ZTogXCIyLWRpZ2l0XCIsXG4gICAgICBob3VyMTI6IHRydWUsXG4gICAgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiaFwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7XG4gICAgICB0eXBlOiBcImhvdXJcIixcbiAgICAgIHZhbHVlOiBcIm51bWVyaWNcIixcbiAgICAgIGhvdXIxMjogdHJ1ZSxcbiAgICB9KSxcbiAgfSxcbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJtbVwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwibWludXRlXCIsIHZhbHVlOiBcIjItZGlnaXRcIiB9KSxcbiAgfSxcbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJtXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJtaW51dGVcIiwgdmFsdWU6IFwibnVtZXJpY1wiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInNzXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJzZWNvbmRcIiwgdmFsdWU6IFwiMi1kaWdpdFwiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInNcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcInNlY29uZFwiLCB2YWx1ZTogXCJudW1lcmljXCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiU1NTXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJmcmFjdGlvbmFsU2Vjb25kXCIsIHZhbHVlOiAzIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcIlNTXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJmcmFjdGlvbmFsU2Vjb25kXCIsIHZhbHVlOiAyIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcIlNcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcImZyYWN0aW9uYWxTZWNvbmRcIiwgdmFsdWU6IDEgfSksXG4gIH0sXG5cbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJhXCIpLFxuICAgIGZuOiAodmFsdWU6IHVua25vd24pOiBDYWxsYmFja1Jlc3VsdCA9PiAoe1xuICAgICAgdHlwZTogXCJkYXlQZXJpb2RcIixcbiAgICAgIHZhbHVlOiB2YWx1ZSBhcyBzdHJpbmcsXG4gICAgfSksXG4gIH0sXG5cbiAgLy8gcXVvdGVkIGxpdGVyYWxcbiAge1xuICAgIHRlc3Q6IGNyZWF0ZU1hdGNoVGVzdEZ1bmN0aW9uKC9eKCcpKD88dmFsdWU+XFxcXC58W15cXCddKilcXDEvKSxcbiAgICBmbjogKG1hdGNoOiB1bmtub3duKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHtcbiAgICAgIHR5cGU6IFwibGl0ZXJhbFwiLFxuICAgICAgdmFsdWU6IChtYXRjaCBhcyBSZWdFeHBFeGVjQXJyYXkpLmdyb3VwcyEudmFsdWUgYXMgc3RyaW5nLFxuICAgIH0pLFxuICB9LFxuICAvLyBsaXRlcmFsXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVNYXRjaFRlc3RGdW5jdGlvbigvXi4rP1xccyovKSxcbiAgICBmbjogKG1hdGNoOiB1bmtub3duKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHtcbiAgICAgIHR5cGU6IFwibGl0ZXJhbFwiLFxuICAgICAgdmFsdWU6IChtYXRjaCBhcyBSZWdFeHBFeGVjQXJyYXkpWzBdLFxuICAgIH0pLFxuICB9LFxuXTtcblxudHlwZSBGb3JtYXRQYXJ0ID0ge1xuICB0eXBlOiBEYXRlVGltZUZvcm1hdFBhcnRUeXBlcztcbiAgdmFsdWU6IHN0cmluZyB8IG51bWJlcjtcbiAgaG91cjEyPzogYm9vbGVhbjtcbn07XG50eXBlIEZvcm1hdCA9IEZvcm1hdFBhcnRbXTtcblxuZXhwb3J0IGNsYXNzIERhdGVUaW1lRm9ybWF0dGVyIHtcbiAgI2Zvcm1hdDogRm9ybWF0O1xuXG4gIGNvbnN0cnVjdG9yKGZvcm1hdFN0cmluZzogc3RyaW5nLCBydWxlczogUnVsZVtdID0gZGVmYXVsdFJ1bGVzKSB7XG4gICAgY29uc3QgdG9rZW5pemVyID0gbmV3IFRva2VuaXplcihydWxlcyk7XG4gICAgdGhpcy4jZm9ybWF0ID0gdG9rZW5pemVyLnRva2VuaXplKFxuICAgICAgZm9ybWF0U3RyaW5nLFxuICAgICAgKHsgdHlwZSwgdmFsdWUsIGhvdXIxMiB9KSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHtcbiAgICAgICAgICB0eXBlLFxuICAgICAgICAgIHZhbHVlLFxuICAgICAgICB9IGFzIHVua25vd24gYXMgUmVjZWl2ZXJSZXN1bHQ7XG4gICAgICAgIGlmIChob3VyMTIpIHJlc3VsdC5ob3VyMTIgPSBob3VyMTIgYXMgYm9vbGVhbjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0sXG4gICAgKSBhcyBGb3JtYXQ7XG4gIH1cblxuICBmb3JtYXQoZGF0ZTogRGF0ZSwgb3B0aW9uczogT3B0aW9ucyA9IHt9KTogc3RyaW5nIHtcbiAgICBsZXQgc3RyaW5nID0gXCJcIjtcblxuICAgIGNvbnN0IHV0YyA9IG9wdGlvbnMudGltZVpvbmUgPT09IFwiVVRDXCI7XG5cbiAgICBmb3IgKGNvbnN0IHRva2VuIG9mIHRoaXMuI2Zvcm1hdCkge1xuICAgICAgY29uc3QgdHlwZSA9IHRva2VuLnR5cGU7XG5cbiAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFwieWVhclwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSB1dGMgPyBkYXRlLmdldFVUQ0Z1bGxZZWFyKCkgOiBkYXRlLmdldEZ1bGxZZWFyKCk7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gdmFsdWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCAyKS5zbGljZSgtMik7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEZvcm1hdHRlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtb250aFwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSAodXRjID8gZGF0ZS5nZXRVVENNb250aCgpIDogZGF0ZS5nZXRNb250aCgpKSArIDE7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gdmFsdWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCAyKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRm9ybWF0dGVyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImRheVwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSB1dGMgPyBkYXRlLmdldFVUQ0RhdGUoKSA6IGRhdGUuZ2V0RGF0ZSgpO1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IHZhbHVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgXCIyLWRpZ2l0XCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IGRpZ2l0cyh2YWx1ZSwgMik7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEZvcm1hdHRlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJob3VyXCI6IHtcbiAgICAgICAgICBsZXQgdmFsdWUgPSB1dGMgPyBkYXRlLmdldFVUQ0hvdXJzKCkgOiBkYXRlLmdldEhvdXJzKCk7XG4gICAgICAgICAgdmFsdWUgLT0gdG9rZW4uaG91cjEyICYmIGRhdGUuZ2V0SG91cnMoKSA+IDEyID8gMTIgOiAwO1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IHZhbHVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgXCIyLWRpZ2l0XCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IGRpZ2l0cyh2YWx1ZSwgMik7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEZvcm1hdHRlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtaW51dGVcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gdXRjID8gZGF0ZS5nZXRVVENNaW51dGVzKCkgOiBkYXRlLmdldE1pbnV0ZXMoKTtcbiAgICAgICAgICBzd2l0Y2ggKHRva2VuLnZhbHVlKSB7XG4gICAgICAgICAgICBjYXNlIFwibnVtZXJpY1wiOiB7XG4gICAgICAgICAgICAgIHN0cmluZyArPSB2YWx1ZTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHN0cmluZyArPSBkaWdpdHModmFsdWUsIDIpO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIHRocm93IEVycm9yKFxuICAgICAgICAgICAgICAgIGBGb3JtYXR0ZXJFcnJvcjogdmFsdWUgXCIke3Rva2VuLnZhbHVlfVwiIGlzIG5vdCBzdXBwb3J0ZWRgLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwic2Vjb25kXCI6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHV0YyA/IGRhdGUuZ2V0VVRDU2Vjb25kcygpIDogZGF0ZS5nZXRTZWNvbmRzKCk7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gdmFsdWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCAyKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRm9ybWF0dGVyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImZyYWN0aW9uYWxTZWNvbmRcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gdXRjXG4gICAgICAgICAgICA/IGRhdGUuZ2V0VVRDTWlsbGlzZWNvbmRzKClcbiAgICAgICAgICAgIDogZGF0ZS5nZXRNaWxsaXNlY29uZHMoKTtcbiAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCBOdW1iZXIodG9rZW4udmFsdWUpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBGSVhNRShiYXJ0bG9taWVqdSlcbiAgICAgICAgY2FzZSBcInRpbWVab25lTmFtZVwiOiB7XG4gICAgICAgICAgLy8gc3RyaW5nICs9IHV0YyA/IFwiWlwiIDogdG9rZW4udmFsdWVcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwiZGF5UGVyaW9kXCI6IHtcbiAgICAgICAgICBzdHJpbmcgKz0gdG9rZW4udmFsdWUgPyAoZGF0ZS5nZXRIb3VycygpID49IDEyID8gXCJQTVwiIDogXCJBTVwiKSA6IFwiXCI7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImxpdGVyYWxcIjoge1xuICAgICAgICAgIHN0cmluZyArPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgRXJyb3IoYEZvcm1hdHRlckVycm9yOiB7ICR7dG9rZW4udHlwZX0gJHt0b2tlbi52YWx1ZX0gfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzdHJpbmc7XG4gIH1cblxuICBwYXJzZVRvUGFydHMoc3RyaW5nOiBzdHJpbmcpOiBEYXRlVGltZUZvcm1hdFBhcnRbXSB7XG4gICAgY29uc3QgcGFydHM6IERhdGVUaW1lRm9ybWF0UGFydFtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IHRva2VuIG9mIHRoaXMuI2Zvcm1hdCkge1xuICAgICAgY29uc3QgdHlwZSA9IHRva2VuLnR5cGU7XG5cbiAgICAgIGxldCB2YWx1ZSA9IFwiXCI7XG4gICAgICBzd2l0Y2ggKHRva2VuLnR5cGUpIHtcbiAgICAgICAgY2FzZSBcInllYXJcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDR9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezEsMn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtb250aFwiOiB7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezEsMn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15cXGR7Mn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwibmFycm93XCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlthLXpBLVpdKy8uZXhlYyhzdHJpbmcpPy5bMF0gYXMgc3RyaW5nO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgXCJzaG9ydFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15bYS16QS1aXSsvLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwibG9uZ1wiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15bYS16QS1aXSsvLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgUGFyc2VyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImRheVwiOiB7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezEsMn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15cXGR7Mn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgUGFyc2VyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImhvdXJcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGlmICh0b2tlbi5ob3VyMTIgJiYgcGFyc2VJbnQodmFsdWUpID4gMTIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICAgICAgYFRyeWluZyB0byBwYXJzZSBob3VyIGdyZWF0ZXIgdGhhbiAxMi4gVXNlICdIJyBpbnN0ZWFkIG9mICdoJy5gLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15cXGR7Mn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgaWYgKHRva2VuLmhvdXIxMiAmJiBwYXJzZUludCh2YWx1ZSkgPiAxMikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICAgICAgICBgVHJ5aW5nIHRvIHBhcnNlIGhvdXIgZ3JlYXRlciB0aGFuIDEyLiBVc2UgJ0hIJyBpbnN0ZWFkIG9mICdoaCcuYCxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYFBhcnNlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtaW51dGVcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYFBhcnNlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJzZWNvbmRcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYFBhcnNlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJmcmFjdGlvbmFsU2Vjb25kXCI6IHtcbiAgICAgICAgICB2YWx1ZSA9IG5ldyBSZWdFeHAoYF5cXFxcZHske3Rva2VuLnZhbHVlfX1gKS5leGVjKHN0cmluZylcbiAgICAgICAgICAgID8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwidGltZVpvbmVOYW1lXCI6IHtcbiAgICAgICAgICB2YWx1ZSA9IHRva2VuLnZhbHVlIGFzIHN0cmluZztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwiZGF5UGVyaW9kXCI6IHtcbiAgICAgICAgICB2YWx1ZSA9IC9eKEF8UClNLy5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImxpdGVyYWxcIjoge1xuICAgICAgICAgIGlmICghc3RyaW5nLnN0YXJ0c1dpdGgodG9rZW4udmFsdWUgYXMgc3RyaW5nKSkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgIGBMaXRlcmFsIFwiJHt0b2tlbi52YWx1ZX1cIiBub3QgZm91bmQgXCIke3N0cmluZy5zbGljZSgwLCAyNSl9XCJgLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsdWUgPSB0b2tlbi52YWx1ZSBhcyBzdHJpbmc7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IEVycm9yKGAke3Rva2VuLnR5cGV9ICR7dG9rZW4udmFsdWV9YCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgYHZhbHVlIG5vdCB2YWxpZCBmb3IgdG9rZW4geyAke3R5cGV9ICR7dmFsdWV9IH0gJHtcbiAgICAgICAgICAgIHN0cmluZy5zbGljZShcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgMjUsXG4gICAgICAgICAgICApXG4gICAgICAgICAgfWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXJ0cy5wdXNoKHsgdHlwZSwgdmFsdWUgfSk7XG5cbiAgICAgIHN0cmluZyA9IHN0cmluZy5zbGljZSh2YWx1ZS5sZW5ndGgpO1xuICAgIH1cblxuICAgIGlmIChzdHJpbmcubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgYGRhdGV0aW1lIHN0cmluZyB3YXMgbm90IGZ1bGx5IHBhcnNlZCEgJHtzdHJpbmcuc2xpY2UoMCwgMjUpfWAsXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJ0cztcbiAgfVxuXG4gIC8qKiBzb3J0ICYgZmlsdGVyIGRhdGVUaW1lRm9ybWF0UGFydCAqL1xuICBzb3J0RGF0ZVRpbWVGb3JtYXRQYXJ0KHBhcnRzOiBEYXRlVGltZUZvcm1hdFBhcnRbXSk6IERhdGVUaW1lRm9ybWF0UGFydFtdIHtcbiAgICBsZXQgcmVzdWx0OiBEYXRlVGltZUZvcm1hdFBhcnRbXSA9IFtdO1xuICAgIGNvbnN0IHR5cGVBcnJheSA9IFtcbiAgICAgIFwieWVhclwiLFxuICAgICAgXCJtb250aFwiLFxuICAgICAgXCJkYXlcIixcbiAgICAgIFwiaG91clwiLFxuICAgICAgXCJtaW51dGVcIixcbiAgICAgIFwic2Vjb25kXCIsXG4gICAgICBcImZyYWN0aW9uYWxTZWNvbmRcIixcbiAgICBdO1xuICAgIGZvciAoY29uc3QgdHlwZSBvZiB0eXBlQXJyYXkpIHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBwYXJ0cy5maW5kSW5kZXgoKGVsKSA9PiBlbC50eXBlID09PSB0eXBlKTtcbiAgICAgIGlmIChjdXJyZW50ICE9PSAtMSkge1xuICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHBhcnRzLnNwbGljZShjdXJyZW50LCAxKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQocGFydHMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwYXJ0c1RvRGF0ZShwYXJ0czogRGF0ZVRpbWVGb3JtYXRQYXJ0W10pOiBEYXRlIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1dGMgPSBwYXJ0cy5maW5kKFxuICAgICAgKHBhcnQpID0+IHBhcnQudHlwZSA9PT0gXCJ0aW1lWm9uZU5hbWVcIiAmJiBwYXJ0LnZhbHVlID09PSBcIlVUQ1wiLFxuICAgICk7XG5cbiAgICBjb25zdCBkYXlQYXJ0ID0gcGFydHMuZmluZCgocGFydCkgPT4gcGFydC50eXBlID09PSBcImRheVwiKTtcblxuICAgIHV0YyA/IGRhdGUuc2V0VVRDSG91cnMoMCwgMCwgMCwgMCkgOiBkYXRlLnNldEhvdXJzKDAsIDAsIDAsIDApO1xuICAgIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuICAgICAgc3dpdGNoIChwYXJ0LnR5cGUpIHtcbiAgICAgICAgY2FzZSBcInllYXJcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUucGFkU3RhcnQoNCwgXCIyMFwiKSk7XG4gICAgICAgICAgdXRjID8gZGF0ZS5zZXRVVENGdWxsWWVhcih2YWx1ZSkgOiBkYXRlLnNldEZ1bGxZZWFyKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwibW9udGhcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUpIC0gMTtcbiAgICAgICAgICBpZiAoZGF5UGFydCkge1xuICAgICAgICAgICAgdXRjXG4gICAgICAgICAgICAgID8gZGF0ZS5zZXRVVENNb250aCh2YWx1ZSwgTnVtYmVyKGRheVBhcnQudmFsdWUpKVxuICAgICAgICAgICAgICA6IGRhdGUuc2V0TW9udGgodmFsdWUsIE51bWJlcihkYXlQYXJ0LnZhbHVlKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDTW9udGgodmFsdWUpIDogZGF0ZS5zZXRNb250aCh2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJkYXlcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUpO1xuICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDRGF0ZSh2YWx1ZSkgOiBkYXRlLnNldERhdGUodmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJob3VyXCI6IHtcbiAgICAgICAgICBsZXQgdmFsdWUgPSBOdW1iZXIocGFydC52YWx1ZSk7XG4gICAgICAgICAgY29uc3QgZGF5UGVyaW9kID0gcGFydHMuZmluZChcbiAgICAgICAgICAgIChwYXJ0OiBEYXRlVGltZUZvcm1hdFBhcnQpID0+IHBhcnQudHlwZSA9PT0gXCJkYXlQZXJpb2RcIixcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChkYXlQZXJpb2Q/LnZhbHVlID09PSBcIlBNXCIpIHZhbHVlICs9IDEyO1xuICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDSG91cnModmFsdWUpIDogZGF0ZS5zZXRIb3Vycyh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcIm1pbnV0ZVwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBOdW1iZXIocGFydC52YWx1ZSk7XG4gICAgICAgICAgdXRjID8gZGF0ZS5zZXRVVENNaW51dGVzKHZhbHVlKSA6IGRhdGUuc2V0TWludXRlcyh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcInNlY29uZFwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBOdW1iZXIocGFydC52YWx1ZSk7XG4gICAgICAgICAgdXRjID8gZGF0ZS5zZXRVVENTZWNvbmRzKHZhbHVlKSA6IGRhdGUuc2V0U2Vjb25kcyh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImZyYWN0aW9uYWxTZWNvbmRcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUpO1xuICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDTWlsbGlzZWNvbmRzKHZhbHVlKSA6IGRhdGUuc2V0TWlsbGlzZWNvbmRzKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGF0ZTtcbiAgfVxuXG4gIHBhcnNlKHN0cmluZzogc3RyaW5nKTogRGF0ZSB7XG4gICAgY29uc3QgcGFydHMgPSB0aGlzLnBhcnNlVG9QYXJ0cyhzdHJpbmcpO1xuICAgIGNvbnN0IHNvcnRQYXJ0cyA9IHRoaXMuc29ydERhdGVUaW1lRm9ybWF0UGFydChwYXJ0cyk7XG4gICAgcmV0dXJuIHRoaXMucGFydHNUb0RhdGUoc29ydFBhcnRzKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxxQ0FBcUM7QUFFckMsU0FNRSxTQUFTLFFBQ0osZ0JBQWdCLENBQUM7QUFFeEIsU0FBUyxNQUFNLENBQUMsS0FBc0IsRUFBRSxLQUFLLEdBQUcsQ0FBQyxFQUFVO0lBQ3pELE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7Q0FDM0M7QUE0QkQsU0FBUyx5QkFBeUIsQ0FBQyxLQUFhLEVBQWdCO0lBQzlELE9BQU8sQ0FBQyxNQUFjLEdBQWlCO1FBQ3JDLE9BQU8sTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FDM0I7WUFBRSxLQUFLO1lBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1NBQUUsR0FDL0IsU0FBUyxDQUFDO0tBQ2YsQ0FBQztDQUNIO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxLQUFhLEVBQWdCO0lBQzVELE9BQU8sQ0FBQyxNQUFjLEdBQWlCO1FBQ3JDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEFBQUM7UUFDbEMsSUFBSSxNQUFNLEVBQUUsT0FBTztZQUFFLEtBQUssRUFBRSxNQUFNO1lBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFN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