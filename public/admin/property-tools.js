(function () {
  'use strict';
  let previousObserver;
  let previousMap;
  function attach(form) {
    if (previousObserver) previousObserver.disconnect();
    if(previousMap){previousMap.remove();previousMap=null;}
    attachLocation(form);
    const kind=form.elements.listing_kind, status=form.elements.status;
    function update() {
      const rent=kind.value==='rent';
      form.querySelectorAll('[data-rental]').forEach(el=>{el.hidden=!rent;});
      const old=status.value;
      const mapped=rent ? ({'在售':'在租','已售':'已租'}[old] || old) : ({'在租':'在售','已租':'已售'}[old] || old);
      const options=rent ? ['在租','已租','下架'] : ['在售','已售','下架'];
      status.replaceChildren(...options.map(value=>{const o=document.createElement('option');o.value=value;o.textContent=value;o.selected=value===mapped;return o;}));
      const label=form.elements.price_value.previousElementSibling;
      if(label)label.textContent=rent?'租金金额 NZD（用于筛选，按所选周期）':'售价金额 NZD（用于筛选，可空）';
      form.elements.price_label.placeholder=rent?'如 $850；页面自动显示每周 / 每月':'如 $1,280,000 / 价格待询';
    }
    kind.addEventListener('change',update);update();
    function decorate() {
      form.querySelectorAll('.imgs:not([data-single]) .im').forEach(im=>{
        if(im.querySelector('.image-order-tools'))return;
        im.draggable=true;
        const tools=document.createElement('div');tools.className='image-order-tools';
        tools.innerHTML='<button type="button" data-move="left" aria-label="图片前移">←</button><button type="button" data-move="right" aria-label="图片后移">→</button>';
        im.append(tools);
        tools.addEventListener('click',e=>{
          const b=e.target.closest('[data-move]');if(!b)return;
          const box=im.parentElement;
          if(b.dataset.move==='left' && im.previousElementSibling)box.insertBefore(im,im.previousElementSibling);
          else if(b.dataset.move==='right' && im.nextElementSibling)box.insertBefore(im.nextElementSibling,im);
        });
      });
    }
    let dragging=null;
    form.addEventListener('dragstart',e=>{const im=e.target.closest('.im');if(im&&!im.parentElement.dataset.single){dragging=im;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',im.dataset.src);}});
    form.addEventListener('dragover',e=>{const im=e.target.closest('.im');if(im&&dragging&&im.parentElement===dragging.parentElement)e.preventDefault();});
    form.addEventListener('drop',e=>{const im=e.target.closest('.im');if(im&&dragging&&im!==dragging&&im.parentElement===dragging.parentElement){e.preventDefault();const bounds=im.getBoundingClientRect();im.parentElement.insertBefore(dragging,e.clientX>bounds.left+bounds.width/2?im.nextSibling:im);}dragging=null;});
    form.addEventListener('dragend',()=>{dragging=null;});
    previousObserver=new MutationObserver(decorate);
    form.querySelectorAll('.imgs').forEach(box=>previousObserver.observe(box,{childList:true}));
    form.classList.add('property-editor');decorate();
  }
  async function attachLocation(form){
    const lat=form.elements.latitude,lng=form.elements.longitude;
    lat.step='any';lng.step='any';lat.min='-90';lat.max='90';lng.min='-180';lng.max='180';
    const panel=document.createElement('div');panel.className='map-editor';
    panel.innerHTML='<strong>地图位置</strong><p class="map-editor-message">填写完整地址后点击定位，选择结果并确认地图位置；也可直接点击地图或拖动圆点。修改地址会清除旧位置。公开房源地址将交给 Photon / OpenStreetMap 查询。</p><div class="map-editor-tools"><button type="button" class="btn" data-geocode>按地址定位</button><button type="button" class="btn" data-clear-location>清除位置</button></div><p class="map-editor-message" data-location-message role="status"></p><div class="map-geocode-results" data-geocode-results></div><div class="map-editor-canvas" data-location-map aria-label="房源位置校正地图"></div><p class="map-editor-message">没有地图位置的房源仍出现在列表中，但不会显示地图标记。地址服务无法找到门牌时，请手动校正位置。地址数据 © OpenStreetMap contributors。</p>';
    lng.closest('.f').after(panel);
    const message=panel.querySelector('[data-location-message]'),results=panel.querySelector('[data-geocode-results]'),canvas=panel.querySelector('[data-location-map]');
    let map,marker,requestNumber=0;
    function read(){return lat.value!==''&&lng.value!==''&&Number.isFinite(Number(lat.value))&&Number.isFinite(Number(lng.value))&&Math.abs(Number(lat.value))<=90&&Math.abs(Number(lng.value))<=180?[Number(lat.value),Number(lng.value)]:null;}
    function render(fit){
      const pos=read();if(!map)return;
      if(marker){map.removeLayer(marker);marker=null;}
      if(pos){marker=L.marker(pos,{draggable:true,icon:L.divIcon({className:'map-pin',iconSize:[18,18],iconAnchor:[9,9]}),title:'拖动校正房源位置'}).addTo(map);marker.on('dragend',()=>{const p=marker.getLatLng();set(p.lat,p.lng,false);});if(fit)map.setView(pos,16);}
    }
    function set(a,b,fit=true){lat.value=Number(a).toFixed(6);lng.value=Number(b).toFixed(6);render(fit);message.textContent='位置已选定，保存房源后生效。请确认圆点与房源实际位置一致。';}
    function clear(){lat.value='';lng.value='';render(false);}
    lat.addEventListener('input',()=>render(true));lng.addEventListener('input',()=>render(true));
    for(const name of ['address','suburb','city'])form.elements[name].addEventListener('input',()=>{requestNumber++;clear();results.replaceChildren();message.textContent='地址已修改，请重新定位或在地图上选点。';});
    panel.querySelector('[data-clear-location]').addEventListener('click',()=>{requestNumber++;clear();results.replaceChildren();message.textContent='位置已清除，保存后将不再显示地图标记。';});
    panel.querySelector('[data-geocode]').addEventListener('click',async e=>{
      const button=e.currentTarget,sequence=++requestNumber;
      const query=['address','suburb','city'].map(name=>form.elements[name].value.trim()).filter(Boolean).join(', ');
      if(!query){message.textContent='请先填写地址或地区。';return;}
      button.disabled=true;message.textContent='正在查找地址…';results.replaceChildren();
      try{
        const response=await fetch('/api/admin/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
        const data=await response.json();if(sequence!==requestNumber||!form.isConnected)return;if(!response.ok)throw Error(data.error||'定位失败');
        message.textContent=data.items.length?'请选择匹配的地址，再检查地图位置。':'没有找到匹配地址。可以调整地址重试，或直接在地图上选点。';
        data.items.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.geocodeResult='';b.textContent=p.label+(p.precision==='address'?'':'（非门牌位置，请手动校正）');b.addEventListener('click',()=>{set(p.latitude,p.longitude);results.replaceChildren();});results.append(b);});
      }catch(err){if(sequence===requestNumber)message.textContent=err.message;}finally{button.disabled=false;}
    });
    try{
      const settings=await TPPropertyMap.config();if(!form.isConnected)return;
      map=L.map(canvas,{scrollWheelZoom:false}).setView(read()||[-36.73,174.7],read()?16:11);previousMap=map;
      L.tileLayer(settings.tile_url,{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);
      map.on('click',event=>set(event.latlng.lat,event.latlng.lng,false));render(false);
      requestAnimationFrame(()=>{if(form.isConnected)map.invalidateSize();});
    }catch(err){canvas.textContent='地图加载失败，仍可填写经纬度或使用地址定位。';}
  }
  window.TPPropertyEditor={attach};
})();
