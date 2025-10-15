import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Upload, message, Spin } from "antd";

export default function ScoreInputPanel({ currentExam, onUpdateExam }) {
  const luckysheet = window.luckysheet;
  const [fileInfo, setFileInfo] = useState(null);
  const luckysheetContainerRef = useRef(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const wsRef = useRef(null);
  const pendingSheetsRef = useRef(null);
  const initEditorRef = useRef(null);
  const currentSheetIndexRef = useRef(0);
  const luckysheetEventsBoundRef = useRef(false);
  const fileInfoRef = useRef(null);
  const isMountedRef = useRef(true);
  const [cellUpdateStatus, setCellUpdateStatus] = useState({ updating: false, lastUpdate: null });
  const pendingCellUpdateRef = useRef(null);

  // 检查Luckysheet是否就绪
  useEffect(() => {
    const checkReady = () => {
      const ls = typeof window !== 'undefined' && window.luckysheet;
      const ready = !!(ls && typeof ls.create === 'function');
      if (ready) {
        setAssetsLoaded(true);
      }
      return ready;
    };

    if (checkReady()) return;
    
    const interval = setInterval(() => {
      if (checkReady()) {
        clearInterval(interval);
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  // 同步文件信息到ref
  useEffect(() => {
    fileInfoRef.current = fileInfo;
  }, [fileInfo]);

  // 组件卸载清理
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) { }
      }
      if (typeof window !== 'undefined' && window.luckysheet && window.luckysheet.destroy) {
        try { window.luckysheet.destroy(); } catch (_) { }
      }
      if (luckysheetContainerRef.current) {
        try { luckysheetContainerRef.current.innerHTML = ''; } catch (_) { }
      }
    };
  }, []);

  // 刷新表格内容
  const refreshTableContent = useCallback((forceRefresh = false) => {
    const fileId = (currentExam && currentExam.fileName) || (fileInfoRef.current && fileInfoRef.current.fileId);
    if (!fileId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[ScoreInputPanel] Cannot refresh table: missing fileId or WebSocket not connected');
      return;
    }

    if (!forceRefresh && pendingCellUpdateRef.current) {
      console.log('[ScoreInputPanel] Skipping refresh, cell update in progress');
      return;
    }

    const sheetSwitchMsg = {
      type: 'sheetSwitch',
      fileId: fileId,
      sheetIndex: currentSheetIndexRef.current
    };

    try {
      wsRef.current.send(JSON.stringify(sheetSwitchMsg));
    } catch (e) {
      console.error('[ScoreInputPanel] Failed to send refresh message:', e);
    }
  }, [currentExam]);

  // 更新单元格内容
  const refreshCellContent = useCallback((row, col, value) => {
    try {
      const ls = window.luckysheet;
      if (ls && typeof ls.setCellValue === 'function') {
        ls.setCellValue(row, col, value);
      }
    } catch (e) {
      console.error('[ScoreInputPanel] Failed to update cell:', e);
    }
  }, []);

  // 获取当前活动工作表索引的辅助函数
  const getCurrentSheetIndex = useCallback(() => {
    try {
      const ls = window.luckysheet;
      if (ls && typeof ls.getSheet === 'function') {
        const sheets = ls.getSheet();
        console.log('[ScoreInputPanel] getSheet() returned:', typeof sheets, sheets);
        
        // 如果 sheets 是对象（单个工作表），直接返回 0
        if (sheets && typeof sheets === 'object' && !Array.isArray(sheets)) {
          console.log('[ScoreInputPanel] Single sheet object, status:', sheets.status, 'name:', sheets.name);
          return 0; // 单个工作表时索引为 0
        }
        
        // 如果 sheets 是数组（多个工作表），查找 status === 1 的工作表
        if (Array.isArray(sheets)) {
          const activeIndex = sheets.findIndex(sheet => sheet && sheet.status === 1);
          if (activeIndex >= 0) {
            console.log('[ScoreInputPanel] Found active sheet at index:', activeIndex, 'sheet name:', sheets[activeIndex]?.name);
            return activeIndex;
          } else {
            console.warn('[ScoreInputPanel] No active sheet found (status=1), sheets count:', sheets.length);
            // 打印所有工作表的状态用于调试
            sheets.forEach((sheet, idx) => {
              console.log(`[ScoreInputPanel] Sheet ${idx}: name="${sheet?.name}", status=${sheet?.status}`);
            });
          }
        }
      }
    } catch (e) {
      console.warn('[ScoreInputPanel] Failed to get active sheet index:', e);
    }
    console.log('[ScoreInputPanel] Using fallback sheet index:', currentSheetIndexRef.current);
    return currentSheetIndexRef.current;
  }, []);

  // 发送单元格更新
  const sendCellUpdateWithTracking = useCallback((r, c, v) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // 获取当前活动工作表索引
    const currentSheetIndex = getCurrentSheetIndex();
    currentSheetIndexRef.current = currentSheetIndex;

    const payload = {
      type: 'cellUpdate',
      fileId: (currentExam && currentExam.fileName) || (fileInfoRef.current && fileInfoRef.current.fileId),
      sheetIndex: currentSheetIndex,
      r: r,
      c: c,
      v: v,
      version: 1
    };

    // 记录当前发送的sheetIndex，便于调试
    console.log('[ScoreInputPanel] Sending cellUpdate with sheetIndex:', currentSheetIndex, 'for cell [', r, ',', c, '] with value:', v);

    pendingCellUpdateRef.current = {
      timestamp: Date.now(),
      payload: payload,
      row: r,
      col: c,
      value: v
    };

    setCellUpdateStatus(prev => ({ ...prev, updating: true }));

    // 设置超时处理
    setTimeout(() => {
      if (pendingCellUpdateRef.current && pendingCellUpdateRef.current.timestamp === payload.timestamp) {
        console.warn('[ScoreInputPanel] Cell update timeout, using lightweight refresh');
        setCellUpdateStatus(prev => ({ ...prev, updating: false }));
        const pending = pendingCellUpdateRef.current;
        refreshCellContent(pending.row, pending.col, pending.value);
        pendingCellUpdateRef.current = null;
      }
    }, 3000);

    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      console.error('[ScoreInputPanel] Failed to send cellUpdate:', e);
      setCellUpdateStatus(prev => ({ ...prev, updating: false }));
      pendingCellUpdateRef.current = null;
    }
  }, [currentExam, refreshCellContent, getCurrentSheetIndex]);

  // 绑定Luckysheet事件监听器
  const bindLuckysheetEvents = useCallback(() => {
    if (luckysheetEventsBoundRef.current) return;

    const ls = window.luckysheet;
    if (!ls) return;

    const safeSend = (msg) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try { 
        ws.send(JSON.stringify(msg)); 
        return true; 
      } catch (_) { 
        return false; 
      }
    };

    // 单元格更新事件
    const onCellUpdate = function (cell, value, oldValue) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      let r, c, v;
      if (typeof cell === 'object' && cell !== null) {
        r = cell.r || cell.row || (Array.isArray(cell.row) ? cell.row[0] : 0);
        c = cell.c || cell.column || cell.col || (Array.isArray(cell.column) ? cell.column[0] : 0);
      } else {
        r = 0;
        c = 0;
      }

      v = value || oldValue || '';
      sendCellUpdateWithTracking(r, c, v);
    };

    // 工作表切换事件
    const onSwitchSheet = function (index, skipServerNotify = false) {
      let newSheetIndex = typeof index === 'number' ? index : 0;
      
      // 如果传入的index有效，直接使用；否则尝试获取当前活动的工作表
      if (typeof index !== 'number' || index < 0) {
        newSheetIndex = getCurrentSheetIndex();
      }

      const oldSheetIndex = currentSheetIndexRef.current;
      currentSheetIndexRef.current = newSheetIndex;
      
      console.log('[ScoreInputPanel] Sheet switched from', oldSheetIndex, 'to', newSheetIndex, 'skipServerNotify:', skipServerNotify);

      if (!skipServerNotify) {
        const payload = {
          type: 'sheetSwitch',
          fileId: (currentExam && currentExam.fileName) || (fileInfoRef.current && fileInfoRef.current.fileId),
          sheetIndex: newSheetIndex,
        };
        safeSend(payload);
      }
    };

    // 绑定事件
    const bindEvent = (event, handler) => {
      try {
        if (typeof ls.on === 'function') {
          ls.on(event, handler);
        } else if (typeof ls.bind === 'function') {
          ls.bind(event, handler);
        }
      } catch (e) {
        console.warn(`[ScoreInputPanel] Failed to bind ${event}:`, e);
      }
    };

    // 绑定单元格更新事件
    bindEvent('cellUpdate', onCellUpdate);
    bindEvent('cellUpdated', onCellUpdate);
    bindEvent('updateCell', onCellUpdate);
    bindEvent('cellEditEnd', onCellUpdate);
    bindEvent('cellValueChanged', onCellUpdate);
    bindEvent('cellChanged', onCellUpdate);
    bindEvent('afterCellEdit', onCellUpdate);
    bindEvent('cellEditAfter', onCellUpdate);

    // 绑定工作表切换事件
    bindEvent('sheetActivate', onSwitchSheet);

    // DOM事件监听工作表切换
    setTimeout(() => {
      const luckysheetContainer = document.querySelector('#luckysheet');
      if (luckysheetContainer) {
        luckysheetContainer.addEventListener('click', (e) => {
          const target = e.target;
          if (target && target.classList.contains('luckysheet-sheets-item')) {
            setTimeout(() => {
              try {
                const activeIndex = getCurrentSheetIndex();
                onSwitchSheet(activeIndex, true);
              } catch (e) {
                console.warn('[ScoreInputPanel] Failed to get active sheet after click:', e);
              }
            }, 50);
          }
        });
      }
    }, 1000);

    luckysheetEventsBoundRef.current = true;
  }, [sendCellUpdateWithTracking, currentExam, getCurrentSheetIndex]);

  // 构建Luckysheet数据
  const buildLuckysheetData = useCallback((sheetsFromApi) => {
    try {
      return sheetsFromApi.map((s, idx) => {
        let name = (s && (s.name || s.sheetName)) || `Sheet${idx + 1}`;
        let row, column, celldata = [], config = undefined;

        if (s && Array.isArray(s.celldata)) {
          for (let i = 0; i < s.celldata.length; i += 1) {
            const cell = s.celldata[i];
            if (!cell || typeof cell.r !== 'number' || typeof cell.c !== 'number') continue;
            const value = cell.v == null ? '' : cell.v;
            const vObj = { v: value, m: cell.m == null ? value : cell.m };
            
            const keysToCopy = ['ff', 'fs', 'fc', 'bg', 'bl', 'it', 'vt', 'ht', 'bd', 'mc'];
            for (let k = 0; k < keysToCopy.length; k += 1) {
              const key = keysToCopy[k];
              if (Object.prototype.hasOwnProperty.call(cell, key)) {
                vObj[key] = cell[key];
              }
            }
            celldata.push({ r: cell.r, c: cell.c, v: vObj });
          }
          row = s.row;
          column = s.column;
          if (s.config) config = s.config;
          if (!config && s.merge) config = { merge: s.merge };
        } else {
          const parsed = s && s.sheetData ? JSON.parse(s.sheetData) : {};
          const matrix = parsed.celldata || [];
          row = parsed.row || (Array.isArray(matrix) ? matrix.length : undefined);
          column = parsed.column || (Array.isArray(matrix) && matrix[0] ? matrix[0].length : undefined);
          
          if (Array.isArray(matrix)) {
            for (let r = 0; r < matrix.length; r += 1) {
              const rowArr = matrix[r];
              if (!Array.isArray(rowArr)) continue;
              for (let c = 0; c < rowArr.length; c += 1) {
                const cell = rowArr[c];
                if (!cell || (cell.v == null && cell.m == null)) continue;
                const value = cell.v == null ? '' : cell.v;
                const m = cell.m == null ? value : cell.m;
                const v = { v: value, m };
                if (cell.mc) v.mc = cell.mc;
                else if (cell.v && cell.v.mc) v.mc = cell.v.mc;
                
                const styleKeys = ['ff', 'fs', 'fc', 'bg', 'bl', 'it', 'vt', 'ht', 'bd'];
                for (let si = 0; si < styleKeys.length; si += 1) {
                  const sk = styleKeys[si];
                  if (cell[sk] != null) v[sk] = cell[sk];
                }
                celldata.push({ r, c, v });
              }
            }
          }
          if (parsed && parsed.config) config = parsed.config;
          else if (parsed && parsed.merge) config = { merge: parsed.merge };
        }

        return { name, celldata, row, column, config };
      });
    } catch (e) {
      console.error('[ScoreInputPanel] buildLuckysheetData error', e);
      return [];
    }
  }, []);

  // 处理WebSocket消息
  const handleWebSocketMessage = useCallback((data) => {
    if (!data || typeof window === 'undefined' || !window.luckysheet || !isMountedRef.current) {
      return;
    }

    switch (data.type) {
      case 'cellUpdate': {
        const idx = Number(data.sheetIndex) || 0;
        if (idx === currentSheetIndexRef.current) {
          try {
            window.luckysheet.setCellValue(data.r, data.c, data.v);
          } catch (e) {
            console.log('[ScoreInputPanel] Apply cellUpdate failed:', e);
          }
        }
        break;
      }
      case 'cellUpdateSuccess': {
        setCellUpdateStatus(prev => ({
          updating: false,
          lastUpdate: {
            timestamp: Date.now(),
            row: data.r,
            col: data.c,
            value: data.v,
            sheetIndex: data.sheetIndex
          }
        }));
        pendingCellUpdateRef.current = null;
        break;
      }
      case 'init': {
        if (Array.isArray(data.data)) {
          try {
            const ls = window.luckysheet;
            const containerEl = luckysheetContainerRef.current;
            if (containerEl) containerEl.innerHTML = '';
            ls.create({ 
              container: 'luckysheet', 
              lang: 'zh', 
              showinfobar: false, 
              data: data.data 
            });
          } catch (e) {
            console.log('[ScoreInputPanel] Apply init failed:', e);
          }
        }
        break;
      }
      case 'sheetData':
      case 'sheetSwitch': {
        try {
          // 更新本地的工作表索引，确保与服务器同步
          if (typeof data.sheetIndex === 'number') {
            currentSheetIndexRef.current = data.sheetIndex;
            console.log('[ScoreInputPanel] Updated currentSheetIndexRef to:', data.sheetIndex);
          }

          const ls = window.luckysheet;
          const containerEl = luckysheetContainerRef.current;

          if (!containerEl || !containerEl.parentNode || !isMountedRef.current) {
            return;
          }

          if (containerEl) containerEl.innerHTML = '';

          let sheetData = data.sheetData;
          if (typeof sheetData === 'string') {
            sheetData = JSON.parse(sheetData);
          }

          if (sheetData) {
            let luckysheetData;
            if (Array.isArray(sheetData)) {
              luckysheetData = buildLuckysheetData(sheetData);
            } else {
              let celldata = [];
              if (Array.isArray(sheetData.celldata)) {
                for (let r = 0; r < sheetData.celldata.length; r++) {
                  const row = sheetData.celldata[r];
                  if (Array.isArray(row)) {
                    for (let c = 0; c < row.length; c++) {
                      const cell = row[c];
                      if (cell && (cell.v !== undefined || cell.m !== undefined)) {
                        celldata.push({ r, c, v: cell });
                      }
                    }
                  }
                }
              }
              luckysheetData = [{
                name: sheetData.name || 'Sheet1',
                celldata: Array.isArray(sheetData.celldata) && !celldata.length ? sheetData.celldata : celldata,
                row: sheetData.row || 50,
                column: sheetData.column || 26,
                config: sheetData.config || {}
              }];
            }

            if (luckysheetData) {
              ls.create({
                container: 'luckysheet',
                lang: 'zh',
                showinfobar: false,
                data: luckysheetData,
                hook: {
                  cellEditEnd: function (row, col, value, isRefresh) {
                    const ws = wsRef.current;
                    if (!ws || ws.readyState !== WebSocket.OPEN) return;
                    sendCellUpdateWithTracking(row, col, value);
                  },
                  cellUpdated: function (row, col, oldValue, newValue, isRefresh) {
                    const ws = wsRef.current;
                    if (!ws || ws.readyState !== WebSocket.OPEN) return;
                    sendCellUpdateWithTracking(row, col, newValue);
                  },
                  sheetActivate: function (index) {
                    currentSheetIndexRef.current = typeof index === 'number' ? index : 0;
                  }
                }
              });

              bindLuckysheetEvents();
            }
          }
        } catch (e) {
          console.error('[ScoreInputPanel] Apply sheetData failed:', e);
        }
        break;
      }
      default: {
        if (data && (data.celldata || data.data)) {
          try {
            const ls = window.luckysheet;
            const containerEl = luckysheetContainerRef.current;
            if (containerEl) containerEl.innerHTML = '';

            let luckysheetData;
            if (Array.isArray(data.data)) {
              luckysheetData = data.data;
            } else if (data.celldata) {
              luckysheetData = [{
                name: 'Sheet1',
                celldata: data.celldata,
                row: data.row || 50,
                column: data.column || 26,
                config: data.config || {}
              }];
            }

            if (luckysheetData) {
              ls.create({
                container: 'luckysheet',
                lang: 'zh',
                showinfobar: false,
                data: luckysheetData
              });
            }
          } catch (e) {
            console.log('[ScoreInputPanel] Apply default message data failed:', e);
          }
        }
        break;
      }
    }
  }, [buildLuckysheetData, sendCellUpdateWithTracking, bindLuckysheetEvents]);

  // 初始化编辑器
  const initEditorWithSheets = useCallback((sheetsFromApi) => {
    if (!assetsLoaded) {
      message.warning('编辑器脚本未就绪');
      return;
    }
    
    const containerEl = luckysheetContainerRef.current;
    if (!containerEl) { 
      message.error('容器未就绪'); 
      return; 
    }
    
    const ls = typeof window !== 'undefined' ? window.luckysheet : undefined;
    if (!ls || typeof ls.create !== 'function') {
      message.error('Luckysheet 未加载');
      return;
    }
    
    const data = buildLuckysheetData(sheetsFromApi);

    const options = {
      container: 'luckysheet',
      lang: 'zh',
      showinfobar: false,
      showtoolbar: true,
      showsheetbar: true,
      cellRightClickConfig: { 
        copy: true, 
        copyAs: true, 
        paste: true, 
        insertRow: false, 
        insertColumn: false, 
        deleteRow: false, 
        deleteColumn: false, 
        deleteCell: false, 
        hideRow: false, 
        hideColumn: false 
      },
      data: data && data.length ? data : [{ name: 'Sheet1', data: [], row: 50, column: 26 }],
      hook: {
        cellEditEnd: function (row, col, value) {
          sendCellUpdateWithTracking(row, col, value);
        },
        cellUpdated: function (row, col, oldVal, newVal) {
          sendCellUpdateWithTracking(row, col, typeof newVal === 'undefined' ? oldVal : newVal);
        },
        updateCell: function (r, c, v) {
          sendCellUpdateWithTracking(r, c, v);
        },
        sheetActivate: function (index) {
          currentSheetIndexRef.current = typeof index === 'number' ? index : 0;
        },
      },
    };
    
    try {
      containerEl.innerHTML = '';
      ls.create(options);
      bindLuckysheetEvents();
    } catch (err) {
      console.error('[ScoreInputPanel] initEditorWithSheets error', err);
      message.error('初始化表格失败');
    }
  }, [assetsLoaded, buildLuckysheetData, sendCellUpdateWithTracking, bindLuckysheetEvents]);

  // 连接WebSocket
  const connectWebSocket = useCallback((fileId) => {
    try {
      if (!fileId) return;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const sheetSwitchMsg = {
          type: 'sheetSwitch',
          fileId: fileId,
          sheetIndex: 0
        };
        try {
          wsRef.current.send(JSON.stringify(sheetSwitchMsg));
        } catch (e) {
          console.error('[ScoreInputPanel] Failed to send sheetSwitch message:', e);
        }
        return;
      }

      if (wsRef.current && wsRef.current.readyState <= WebSocket.CLOSING) {
        try { wsRef.current.close(); } catch (_) { }
      }

      const buildUrl = () => `wss://119.lysh.sinopec.com:8190/backend/lysh/ws/excel?fileId=${encodeURIComponent(fileId)}`;
      let reconnectAttempts = 0;
      const maxReconnectAttempts = 3;
      let reconnectTimer = null;

      const openSocket = (url) => {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        const heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch (e) {
              console.warn('[ScoreInputPanel] Heartbeat failed:', e);
            }
          }
        }, 30000);

        ws.onopen = () => {
          reconnectAttempts = 0;
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }

          const sheetSwitchMsg = {
            type: 'sheetSwitch',
            fileId: fileId,
            sheetIndex: 0
          };
          try {
            ws.send(JSON.stringify(sheetSwitchMsg));
          } catch (e) {
            console.error('[ScoreInputPanel] Failed to send sheetSwitch message:', e);
          }
        };

        ws.onmessage = (evt) => {
          try {
            const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
            if (data.type === 'pong') return;
            handleWebSocketMessage(data);
          } catch (e) {
            console.log('[ScoreInputPanel] WS message (non-JSON):', evt.data);
          }
        };

        ws.onerror = (e) => {
          console.error('[ScoreInputPanel] WS error:', e);
          clearInterval(heartbeatInterval);
        };

        ws.onclose = (ev) => {
          clearInterval(heartbeatInterval);
          if (ev.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            reconnectTimer = setTimeout(() => {
              if (isMountedRef.current) {
                openSocket(buildUrl());
              }
            }, delay);
          }
        };
      };

      openSocket(buildUrl());
    } catch (e) {
      console.error('[ScoreInputPanel] connectWebSocket error', e);
    }
  }, [handleWebSocketMessage]);

  // 文件上传处理
  const handleUpload = useCallback(async (option) => {
    const formData = new FormData();
    formData.append("file", option.file);
    
    try {
      const api = await import('@/api/subjectGrades');
      const uploader = api.uploadSubjectGrades;
      const res = await uploader(formData);
      
      if (res && (res.status === 200 || res.code === 200)) {
        const payload = res.data || res.result || {};
        const next = { fileId: payload.fileId || payload.id, fileName: option.file.name };
        
        if (!next.fileId) {
          message.error("上传成功，但未返回文件ID");
          option.onError(new Error("missing fileId"));
          return;
        }
        
        setFileInfo(next);
        message.success("上传成功");
        option.onSuccess(res, option.file);

        if (onUpdateExam && currentExam) {
          try {
            const updateParams = {
              ...currentExam,
              fileName: next.fileId,
              fileUrl: payload.httpUrl || payload.url || next.fileId
            };
            await onUpdateExam(updateParams);
          } catch (updateErr) {
            console.error('[ScoreInputPanel] Failed to update exam:', updateErr);
            message.warning('文件上传成功，但保存考核信息失败');
          }
        }

        if (payload && Array.isArray(payload.sheets)) {
          if (assetsLoaded) {
            if (initEditorRef.current) {
              initEditorRef.current(payload.sheets);
            }
          } else {
            pendingSheetsRef.current = payload.sheets;
          }
        }
        
        connectWebSocket(next.fileId);
      } else {
        message.error("上传失败");
        option.onError(new Error("upload failed"));
      }
    } catch (e) {
      console.error(e);
      message.error("上传失败");
      option.onError(e);
    }
  }, [assetsLoaded, currentExam, onUpdateExam, connectWebSocket]);

  // 导出处理
  const handleExport = useCallback(async () => {
    if (!fileInfo || !fileInfo.fileId) { 
      message.warning("请先上传Excel文件"); 
      return; 
    }
    
    try {
      const api = await import('@/api/subjectGrades');
      const exporter = api.exportSubjectGrades;
      const res = await exporter({ fileId: fileInfo.fileId });
      const blob = new Blob([res]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileInfo.fileName || "成绩表") + "-导出.xlsx";
      document.body.appendChild(a); 
      a.click(); 
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) { 
      message.error("导出失败"); 
    }
  }, [fileInfo]);

  // 同步初始化函数到ref
  useEffect(() => {
    initEditorRef.current = initEditorWithSheets;
  }, [initEditorWithSheets]);

  // 资源就绪后处理待处理的sheets
  useEffect(() => {
    if (assetsLoaded && pendingSheetsRef.current) {
      const sheets = pendingSheetsRef.current;
      pendingSheetsRef.current = null;
      initEditorWithSheets(sheets);
    }
  }, [assetsLoaded, initEditorWithSheets]);

  // 自动连接WebSocket
  useEffect(() => {
    if (assetsLoaded && currentExam && currentExam.fileName && !wsRef.current) {
      connectWebSocket(currentExam.fileName);
    } else if (assetsLoaded && currentExam && currentExam.fileName && wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        const sheetSwitchMsg = {
          type: 'sheetSwitch',
          fileId: currentExam.fileName,
          sheetIndex: 0
        };
        try {
          wsRef.current.send(JSON.stringify(sheetSwitchMsg));
        } catch (e) {
          console.error('[ScoreInputPanel] Failed to send sheetSwitch message:', e);
        }
      }
    }
  }, [assetsLoaded, currentExam, connectWebSocket]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "70vh" }}>
      <div style={{ marginBottom: 12 }}>
        <Upload showUploadList={false} name="file" customRequest={handleUpload} accept=".xls,.xlsx">
          <Button type="primary" style={{ marginRight: 8 }}>
            <Icon type="upload" /> 导入Excel
          </Button>
        </Upload>
        <Button onClick={handleExport} style={{ marginRight: 8 }}>
          <Icon type="download" /> 导出
        </Button>
        <Button
          onClick={() => refreshTableContent(true)}
          disabled={!assetsLoaded}
        >
          <Icon type="reload" /> 刷新表格
        </Button>
        {!assetsLoaded && <span style={{ marginLeft: 12, color: "#faad14" }}>正在加载编辑器资源...</span>}
        {cellUpdateStatus.updating && <span style={{ marginLeft: 12, color: "#52c41a" }}>正在保存单元格更新...</span>}
        {cellUpdateStatus.lastUpdate && (
          <span style={{ marginLeft: 12, color: "#1890ff", fontSize: "12px" }}>
            最后更新: {new Date(cellUpdateStatus.lastUpdate.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 400 }}>
        {!assetsLoaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin tip="正在加载编辑器资源..." />
          </div>
        )}
        <div id="luckysheet" ref={luckysheetContainerRef} style={{ width: "100%", height: "100%", background: "#fff" }} />
      </div>
    </div>
  );
}