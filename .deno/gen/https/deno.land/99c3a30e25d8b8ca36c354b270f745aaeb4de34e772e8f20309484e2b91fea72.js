// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
import { getOptions } from "../internal_binding/node_options.ts";
let optionsMap;
function getOptionsFromBinding() {
    if (!optionsMap) {
        ({ options: optionsMap  } = getOptions());
    }
    return optionsMap;
}
export function getOptionValue(optionName) {
    const options = getOptionsFromBinding();
    if (optionName.startsWith("--no-")) {
        const option = options.get("--" + optionName.slice(5));
        return option && !option.value;
    }
    return options.get(optionName)?.value;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvaW50ZXJuYWwvb3B0aW9ucy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmltcG9ydCB7IGdldE9wdGlvbnMgfSBmcm9tIFwiLi4vaW50ZXJuYWxfYmluZGluZy9ub2RlX29wdGlvbnMudHNcIjtcblxubGV0IG9wdGlvbnNNYXA6IE1hcDxzdHJpbmcsIHsgdmFsdWU6IHN0cmluZyB9PjtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uc0Zyb21CaW5kaW5nKCkge1xuICBpZiAoIW9wdGlvbnNNYXApIHtcbiAgICAoeyBvcHRpb25zOiBvcHRpb25zTWFwIH0gPSBnZXRPcHRpb25zKCkpO1xuICB9XG5cbiAgcmV0dXJuIG9wdGlvbnNNYXA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPcHRpb25WYWx1ZShvcHRpb25OYW1lOiBzdHJpbmcpIHtcbiAgY29uc3Qgb3B0aW9ucyA9IGdldE9wdGlvbnNGcm9tQmluZGluZygpO1xuXG4gIGlmIChvcHRpb25OYW1lLnN0YXJ0c1dpdGgoXCItLW5vLVwiKSkge1xuICAgIGNvbnN0IG9wdGlvbiA9IG9wdGlvbnMuZ2V0KFwiLS1cIiArIG9wdGlvbk5hbWUuc2xpY2UoNSkpO1xuXG4gICAgcmV0dXJuIG9wdGlvbiAmJiAhb3B0aW9uLnZhbHVlO1xuICB9XG5cbiAgcmV0dXJuIG9wdGlvbnMuZ2V0KG9wdGlvbk5hbWUpPy52YWx1ZTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsc0RBQXNEO0FBQ3RELEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUsZ0VBQWdFO0FBQ2hFLHNFQUFzRTtBQUN0RSxzRUFBc0U7QUFDdEUsNEVBQTRFO0FBQzVFLHFFQUFxRTtBQUNyRSx3QkFBd0I7QUFDeEIsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSx5REFBeUQ7QUFDekQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSw2REFBNkQ7QUFDN0QsNEVBQTRFO0FBQzVFLDJFQUEyRTtBQUMzRSx3RUFBd0U7QUFDeEUsNEVBQTRFO0FBQzVFLHlDQUF5QztBQUV6QyxTQUFTLFVBQVUsUUFBUSxxQ0FBcUMsQ0FBQztBQUVqRSxJQUFJLFVBQVUsQUFBZ0MsQUFBQztBQUUvQyxTQUFTLHFCQUFxQixHQUFHO0lBQy9CLElBQUksQ0FBQyxVQUFVLEVBQUU7UUFDZixDQUFDLEVBQUUsT0FBTyxFQUFFLFVBQVUsQ0FBQSxFQUFFLEdBQUcsVUFBVSxFQUFFLENBQUMsQ0FBQztLQUMxQztJQUVELE9BQU8sVUFBVSxDQUFDO0NBQ25CO0FBRUQsT0FBTyxTQUFTLGNBQWMsQ0FBQyxVQUFrQixFQUFFO0lBQ2pELE1BQU0sT0FBTyxHQUFHLHFCQUFxQixFQUFFLEFBQUM7SUFFeEMsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ2xDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQUFBQztRQUV2RCxPQUFPLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7S0FDaEM7SUFFRCxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDO0NBQ3ZDIn0=