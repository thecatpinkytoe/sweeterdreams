// Incremental parsing support wrapper added by assistant
let xmlBuffer = '';
let pendingFilters = null;

self.onmessage = function(e) {
    const { type, data } = e.data || {};
    if (type === 'parseChunk') {
        // receive chunk of text from main thread
        if (data && data.chunk) {
            xmlBuffer += data.chunk;
        }
        return;
    }
    if (type === 'parseDone') {
        // data.filters contains the filters used when reading
        pendingFilters = data.filters || {};
        // call the original parseXML function with the whole buffered XML
        try {
            parseXML(xmlBuffer, pendingFilters);
        } catch (err) {
            self.postMessage({ type: 'error', message: 'Worker parseXML failed: ' + err.message });
        }
        // free memory
        xmlBuffer = '';
        pendingFilters = null;
        return;
    }
    // allow other message types to be handled by existing onmessage logic below
};

// --- End wrapper ---

// Worker: Handles heavy XML parsing and statistical calculations

let shouldCancel = false;

self.onmessage = function(e) {
    const { type, data } = e.data;
    
    if (type === 'cancel') {
        shouldCancel = true;
        return;
    }
    
    if (type === 'parse') {
        shouldCancel = false;
        parseXML(data.xml, data.filters);
    }
    
    if (type === 'analyze') {
        shouldCancel = false;
        runAnalysis(data);
    }
};

function parseXML(xmlText, filters) {
    try {
        self.postMessage({ type: 'progress', phase: 'parsing', percent: 5, detail: 'Parsing XML structure...' });
        
        // DEBUG: Check if we even received the XML
        self.postMessage({ type: 'progress', phase: 'parsing', percent: 6, detail: 'XML length: ' + xmlText.length + ' characters' });
        
        const results = { sleep: [], hr: [], resp: [], o2: [] };
        
        // DEBUG: Starting record search
        self.postMessage({ type: 'progress', phase: 'parsing', percent: 7, detail: 'Starting record search...' });
        
        // Match all Record tags - simpler approach
const recordMatches = [];
let pos = 0;

while (true) {
    // Find next <Record
    const start = xmlText.indexOf('<Record ', pos);
    if (start === -1) break;
    
    // Find the end of the opening tag
    const openEnd = xmlText.indexOf('>', start);
    if (openEnd === -1) break;
    
    // Check if self-closing (has /> before the >)
    const isSelfClosing = xmlText.charAt(openEnd - 1) === '/';
    
    if (isSelfClosing) {
        // Self-closing: <Record ... />
        recordMatches.push(xmlText.substring(start, openEnd + 1));
        pos = openEnd + 1;
    } else {
        // Has closing tag: <Record ...>...</Record>
        const closeTag = xmlText.indexOf('</Record>', openEnd);
        if (closeTag !== -1) {
            recordMatches.push(xmlText.substring(start, closeTag + 9));
            pos = closeTag + 9;
        } else {
            // No closing tag found, skip this record
            pos = openEnd + 1;
        }
    }
    
    // Safety check to prevent infinite loop
    if (pos <= start) {
        pos = start + 8;
    }
}
        const totalRecords = recordMatches.length;
        // Debug: log first few records
if (recordMatches.length > 0) {
    self.postMessage({ type: 'progress', phase: 'parsing', percent: 12, detail: 'Sample record: ' + recordMatches[0].substring(0, 100) });
}
        
        self.postMessage({ type: 'progress', phase: 'parsing', percent: 10, detail: 'Found ' + totalRecords.toLocaleString() + ' records to process...' });
        
        const chunkSize = 5000;
        let processed = 0;
        
        for (let i = 0; i < recordMatches.length; i++) {
    if (shouldCancel) {
        self.postMessage({ type: 'cancelled' });
        return;
    }
    
    const record = recordMatches[i];
    
    // Extract opening tag (NO REGEX)
    let openingTag;
    if (record.indexOf('</Record>') !== -1) {
        openingTag = record.substring(0, record.indexOf('>') + 1);
    } else {
        openingTag = record;
    }
    
    // Parse attributes WITHOUT REGEX - use string methods
    const attrs = {};
    const attrNames = ['type', 'value', 'startDate', 'endDate', 'sourceName'];
    
    for (const attrName of attrNames) {
        const search = attrName + '="';
        const startIdx = openingTag.indexOf(search);
        if (startIdx !== -1) {
            const valueStart = startIdx + search.length;
            const valueEnd = openingTag.indexOf('"', valueStart);
            if (valueEnd !== -1) {
                attrs[attrName] = openingTag.substring(valueStart, valueEnd);
            }
        }
    }
    
    const recType = attrs.type || '';
    const value = attrs.value;
    const start = new Date(attrs.startDate);
    const end = new Date(attrs.endDate || attrs.startDate);
    
    // Skip invalid dates
    if (isNaN(start.getTime())) continue;
    
    // Parse based on type
    if (filters.sleep && recType.includes('SleepAnalysis')) {
        results.sleep.push({ 
            stage: parseSleepStage(value), 
            start: start.getTime(), 
            end: end.getTime() 
        });
    }
    else if (filters.hr && recType.includes('HighHeartRateEvent')) {
        // Extract threshold from metadata using string methods
        const metaSearch = 'HKHeartRateEventThreshold" value="';
        const metaIdx = record.indexOf(metaSearch);
        if (metaIdx !== -1) {
            const valStart = metaIdx + metaSearch.length;
            const valEnd = record.indexOf(' ', valStart);
            if (valEnd !== -1) {
                const v = parseFloat(record.substring(valStart, valEnd));
                if (!isNaN(v)) {
                    results.hr.push({ 
                        value: v, 
                        start: start.getTime(), 
                        end: end.getTime() 
                    });
                }
            }
        }
    }
    else if (filters.hr && recType.includes('HeartRate')) {
        const v = parseFloat(value);
        if (!isNaN(v)) {
            results.hr.push({ 
                value: v, 
                start: start.getTime(), 
                end: end.getTime() 
            });
        }
    }
    else if (filters.resp && recType.includes('RespiratoryRate')) {
        const v = parseFloat(value);
        if (!isNaN(v)) {
            results.resp.push({ 
                value: v, 
                start: start.getTime(), 
                end: end.getTime() 
            });
        }
    }
    else if (filters.o2 && recType.includes('OxygenSaturation')) {
        const v = parseFloat(value) * 100;
        if (!isNaN(v)) {
            results.o2.push({ 
                value: v, 
                start: start.getTime(), 
                end: end.getTime() 
            });
        }
    }
    
    processed++;
    if (processed % chunkSize === 0) {
        const pct = 10 + Math.floor((processed / totalRecords) * 80);
        self.postMessage({ 
            type: 'progress', 
            phase: 'parsing', 
            percent: pct, 
            detail: 'Processed ' + processed.toLocaleString() + ' of ' + totalRecords.toLocaleString() + ' records...'
        });
    }
}
        
        // Sort by start time
        results.sleep.sort((a, b) => a.start - b.start);
        results.hr.sort((a, b) => a.start - b.start);
        results.resp.sort((a, b) => a.start - b.start);
        results.o2.sort((a, b) => a.start - b.start);
        
        self.postMessage({ type: 'progress', phase: 'parsing', percent: 95, detail: 'Finalizing...' });
        self.postMessage({ type: 'parseComplete', results });
        
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
}  // ← Closes the parseXML function

function parseSleepStage(val) {
    if (!val) return 'Unknown';
    const v = val.toLowerCase();
    if (v.includes('asleeprem') || v.includes('rem')) return 'REM';
    if (v.includes('asleepdeep') || v.includes('deep')) return 'Deep';
    if (v.includes('asleepcore') || v.includes('core')) return 'Core';
    if (v.includes('asleepunspecified') || v === 'hkcategoryvaluesleepanalysisasleep') return 'Asleep';
    if (v.includes('awake')) return 'Awake';
    if (v.includes('inbed')) return 'InBed';
    return 'Unknown';
}

function runAnalysis(params) {
    const { sleep, hr, resp, o2, startDate, endDate, threshold, sleepPeriods, sleepMode, manualStart, manualEnd } = params;
    
    try {
        self.postMessage({ type: 'progress', phase: 'analysis', percent: 10, detail: 'Filtering data by date range...' });
        
        if (shouldCancel) { self.postMessage({ type: 'cancelled' }); return; }
        
        // Filter by date
        const sleepF = sleep.filter(d => d.start >= startDate && d.start <= endDate);
        const hrAll = hr.filter(d => d.start >= startDate && d.start <= endDate);
        const respAll = resp.filter(d => d.start >= startDate && d.start <= endDate);
        const o2All = o2.filter(d => d.start >= startDate && d.start <= endDate);
        
        self.postMessage({ type: 'progress', phase: 'analysis', percent: 20, detail: 'Identifying sleep windows...' });
        
        if (shouldCancel) { self.postMessage({ type: 'cancelled' }); return; }
        
        // Helper to check if time is in sleep window
        const isInSleep = (ts) => {
            if (sleepMode === 'auto') {
                return sleepPeriods.some(p => ts >= p.start && ts <= p.end);
            } else {
                const d = new Date(ts);
                const h = d.getHours();
                const sh = manualStart, eh = manualEnd;
                return sh < eh ? (h >= sh && h < eh) : (h >= sh || h < eh);
            }
        };
        
        // Separate day/night data
        const hrNight = hrAll.filter(d => isInSleep(d.start));
        const hrDay = hrAll.filter(d => !isInSleep(d.start));
        const respNight = respAll.filter(d => isInSleep(d.start));
        const respDay = respAll.filter(d => !isInSleep(d.start));
        const o2Night = o2All.filter(d => isInSleep(d.start));
        
        self.postMessage({ type: 'progress', phase: 'analysis', percent: 35, detail: 'Detecting HR events...' });
        
        if (shouldCancel) { self.postMessage({ type: 'cancelled' }); return; }
        
        // Detect HR events
        const hrEvents = detectHREvents(hrNight, threshold, sleepF);
        
        self.postMessage({ type: 'progress', phase: 'analysis', percent: 50, detail: 'Detecting oxygen events...' });
        
        if (shouldCancel) { self.postMessage({ type: 'cancelled' }); return; }
        
        // Detect low O2 events
        const lowO2 = o2Night.filter(d => d.value < 90).map(d => ({ ...d, stage: getSleepStageAt(d.start, sleepF) }));
        
        // Detect resp events
        const respLow = respNight.filter(d => d.value < 12);
        const respHigh = respNight.filter(d => d.value > 20);
        
        self.postMessage({ type: 'progress', phase: 'analysis', percent: 65, detail: 'Running statistical tests...' });
        
        if (shouldCancel) { self.postMessage({ type: 'cancelled' }); return; }
        
        // Calculate statistics
        const hrNightStats = getStats(hrNight.map(d => d.value));
        const hrDayStats = getStats(hrDay.map(d => d.value));
        const respNightStats = getStats(respNight.map(d => d.value));
        const o2NightStats = getStats(o2Night.map(d => d.value));
        
        // Day vs night comparison
        const hrComparison = compareGroups(hrNight.map(d => d.value), hrDay.map(d => d.value));
        
        self.postMessage({ type: 'progress', phase: 'analysis', percent: 80, detail: 'Generating clinical patterns...' });
        
        if (shouldCancel) { self.postMessage({ type: 'cancelled' }); return; }
        
        // Clinical pattern scoring
        const clinicalPatterns = scoreClinicalPatterns(hrEvents, lowO2, respLow, respHigh, sleepF);
        
        self.postMessage({ type: 'progress', phase: 'analysis', percent: 95, detail: 'Finalizing results...' });
        
        self.postMessage({ 
            type: 'analysisComplete', 
            results: {
                sleepF, hrNight, hrDay, respNight, o2Night,
                hrEvents, lowO2, respLow, respHigh,
                hrNightStats, hrDayStats, respNightStats, o2NightStats,
                hrComparison, clinicalPatterns
            }
        });
        
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
}

function detectHREvents(hrData, threshold, sleepF) {
    const events = [];
    const minDur = 10 * 60 * 1000;
    let evtStart = null, readings = [];
    
    for (const r of hrData) {
        if (r.value >= threshold) {
            if (!evtStart) { evtStart = r.start; readings = [r]; }
            else { readings.push(r); }
        } else if (evtStart) {
            const evtEnd = readings[readings.length - 1].start;
            if (evtEnd - evtStart >= minDur) {
                const vals = readings.map(x => x.value);
                events.push({
                    start: evtStart, end: evtEnd,
                    duration: (evtEnd - evtStart) / 60000,
                    avg: vals.reduce((a,b) => a+b, 0) / vals.length,
                    max: Math.max(...vals),
                    stage: getSleepStageAt(evtStart, sleepF)
                });
            }
            evtStart = null; readings = [];
        }
    }
    return events;
}

function getSleepStageAt(ts, sleepF) {
    const match = sleepF.find(s => ts >= s.start && ts <= s.end);
    return match ? match.stage : 'Unknown';
}

function getStats(arr) {
    if (!arr.length) return { mean: 0, median: 0, min: 0, max: 0, std: 0, count: 0, q1: 0, q3: 0, iqr: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
    return { mean, median, min: sorted[0], max: sorted[sorted.length-1], std: Math.sqrt(variance), count: arr.length, q1, q3, iqr: q3 - q1 };
}

function compareGroups(arr1, arr2) {
    if (arr1.length < 2 || arr2.length < 2) return { significant: false, diff: 0, effectSize: 0 };
    const s1 = getStats(arr1), s2 = getStats(arr2);
    const diff = s1.median - s2.median;
    const pooledStd = Math.sqrt((s1.std * s1.std + s2.std * s2.std) / 2);
    const effectSize = pooledStd > 0 ? diff / pooledStd : 0;
    
    // Mann-Whitney U approximation
    const n1 = arr1.length, n2 = arr2.length;
    const U = n1 * n2 / 2;
    const sigmaU = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
    const z = Math.abs(diff) / (sigmaU / Math.sqrt(n1 + n2));
    const significant = Math.abs(z) > 1.96;
    
    return { significant, diff, effectSize, s1, s2, n1, n2 };
}

function scoreClinicalPatterns(hrEvents, lowO2, respLow, respHigh, sleepF) {
    const totalHR = hrEvents.length;
    const remHR = hrEvents.filter(e => e.stage === 'REM').length;
    const deepHR = hrEvents.filter(e => e.stage === 'Deep').length;
    const coreHR = hrEvents.filter(e => e.stage === 'Core').length;
    
    const patterns = {
        osa: { score: 0, max: 9, findings: [] },
        ptsd: { score: 0, max: 7, findings: [] },
        plmd: { score: 0, max: 5, findings: [] },
        panic: { score: 0, max: 4, findings: [] }
    };
    
    // OSA scoring
    if (lowO2.length > 5) { patterns.osa.score += 2; patterns.osa.findings.push(lowO2.length + ' oxygen desaturation events'); }
    else if (lowO2.length > 0) { patterns.osa.score += 1; }
    if (respLow.length > 5) { patterns.osa.score += 2; patterns.osa.findings.push(respLow.length + ' low respiratory rate events'); }
    if (deepHR > 2) { patterns.osa.score += 2; patterns.osa.findings.push(deepHR + ' HR events during deep sleep'); }
    
    // PTSD/Nightmare scoring
    if (totalHR > 0 && remHR / totalHR > 0.4) { 
        patterns.ptsd.score += 3; 
        patterns.ptsd.findings.push(Math.round(remHR / totalHR * 100) + '% of HR events during REM'); 
    }
    if (lowO2.length < 3 && totalHR > 5) { 
        patterns.ptsd.score += 2; 
        patterns.ptsd.findings.push('HR elevation without oxygen drops'); 
    }
    
    // PLMD scoring
    if (totalHR > 0 && coreHR / totalHR > 0.4) {
        patterns.plmd.score += 2;
        patterns.plmd.findings.push(Math.round(coreHR / totalHR * 100) + '% of events during Core sleep');
    }
    
    // Panic scoring
    if (respHigh.length > respLow.length && respHigh.length > 5) {
        patterns.panic.score += 2;
        patterns.panic.findings.push(respHigh.length + ' hyperventilation episodes');
    }
    if (coreHR > 3) {
        patterns.panic.score += 1;
        patterns.panic.findings.push('Events during lighter sleep stages');
    }
    
    return patterns;
}
