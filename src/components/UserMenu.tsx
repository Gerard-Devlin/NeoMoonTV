/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

'use client';

import { KeyRound, LogOut, Settings, Shield, User, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { checkForUpdates, CURRENT_VERSION, UpdateStatus } from '@/lib/version';

interface AuthInfo {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
}

export const UserMenu: React.FC = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [storageType, setStorageType] = useState<string>('localstorage');
  const [mounted, setMounted] = useState(false);

  // 设置相关状态
  const [defaultAggregateSearch, setDefaultAggregateSearch] = useState(true);
  const [doubanProxyUrl, setDoubanProxyUrl] = useState('');
  const [imageProxyUrl, setImageProxyUrl] = useState('');
  const [enableOptimization, setEnableOptimization] = useState(true);
  const [enableImageProxy, setEnableImageProxy] = useState(false);
  const [enableDoubanProxy, setEnableDoubanProxy] = useState(false);

  // 修改密码相关状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 版本检查相关状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 获取认证信息和存储类型
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getAuthInfoFromBrowserCookie();
      setAuthInfo(auth);

      const type =
        (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
      setStorageType(type);
    }
  }, []);

  // 从 localStorage 读取设置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAggregateSearch = localStorage.getItem(
        'defaultAggregateSearch'
      );
      if (savedAggregateSearch !== null) {
        setDefaultAggregateSearch(JSON.parse(savedAggregateSearch));
      }

      const savedEnableDoubanProxy = localStorage.getItem('enableDoubanProxy');
      const defaultDoubanProxy =
        (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';
      if (savedEnableDoubanProxy !== null) {
        setEnableDoubanProxy(JSON.parse(savedEnableDoubanProxy));
      } else if (defaultDoubanProxy) {
        setEnableDoubanProxy(true);
      }

      const savedDoubanProxyUrl = localStorage.getItem('doubanProxyUrl');
      if (savedDoubanProxyUrl !== null) {
        setDoubanProxyUrl(savedDoubanProxyUrl);
      } else if (defaultDoubanProxy) {
        setDoubanProxyUrl(defaultDoubanProxy);
      }

      const savedEnableImageProxy = localStorage.getItem('enableImageProxy');
      const defaultImageProxy =
        (window as any).RUNTIME_CONFIG?.IMAGE_PROXY || '';
      if (savedEnableImageProxy !== null) {
        setEnableImageProxy(JSON.parse(savedEnableImageProxy));
      } else if (defaultImageProxy) {
        setEnableImageProxy(true);
      }

      const savedImageProxyUrl = localStorage.getItem('imageProxyUrl');
      if (savedImageProxyUrl !== null) {
        setImageProxyUrl(savedImageProxyUrl);
      } else if (defaultImageProxy) {
        setImageProxyUrl(defaultImageProxy);
      }

      const savedEnableOptimization =
        localStorage.getItem('enableOptimization');
      if (savedEnableOptimization !== null) {
        setEnableOptimization(JSON.parse(savedEnableOptimization));
      }
    }
  }, []);

  // 版本检查
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (error) {
        console.warn('版本检查失败:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  const handleMenuClick = () => {
    setIsOpen(!isOpen);
  };

  const handleCloseMenu = () => {
    setIsOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('注销请求失败:', error);
    }
    window.location.href = '/';
  };

  const handleAdminPanel = () => {
    router.push('/admin');
  };

  const handleChangePassword = () => {
    setIsOpen(false);
    setIsChangePasswordOpen(true);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleCloseChangePassword = () => {
    setIsChangePasswordOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleSubmitChangePassword = async () => {
    setPasswordError('');

    // 验证密码
    if (!newPassword) {
      setPasswordError('新密码不得为空');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || '修改密码失败');
        return;
      }

      // 修改成功，关闭弹窗并登出
      setIsChangePasswordOpen(false);
      await handleLogout();
    } catch (error) {
      setPasswordError('网络错误，请稍后重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  // 设置相关的处理函数
  const handleAggregateToggle = (value: boolean) => {
    setDefaultAggregateSearch(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(value));
    }
  };

  const handleDoubanProxyUrlChange = (value: string) => {
    setDoubanProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanProxyUrl', value);
    }
  };

  const handleImageProxyUrlChange = (value: string) => {
    setImageProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('imageProxyUrl', value);
    }
  };

  const handleOptimizationToggle = (value: boolean) => {
    setEnableOptimization(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableOptimization', JSON.stringify(value));
    }
  };

  const handleImageProxyToggle = (value: boolean) => {
    setEnableImageProxy(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableImageProxy', JSON.stringify(value));
    }
  };

  const handleDoubanProxyToggle = (value: boolean) => {
    setEnableDoubanProxy(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableDoubanProxy', JSON.stringify(value));
    }
  };

  const handleResetSettings = () => {
    const defaultImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY || '';
    const defaultDoubanProxy =
      (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';

    setDefaultAggregateSearch(true);
    setEnableOptimization(true);
    setDoubanProxyUrl(defaultDoubanProxy);
    setEnableDoubanProxy(!!defaultDoubanProxy);
    setEnableImageProxy(!!defaultImageProxy);
    setImageProxyUrl(defaultImageProxy);

    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(true));
      localStorage.setItem('enableOptimization', JSON.stringify(true));
      localStorage.setItem('doubanProxyUrl', defaultDoubanProxy);
      localStorage.setItem(
        'enableDoubanProxy',
        JSON.stringify(!!defaultDoubanProxy)
      );
      localStorage.setItem(
        'enableImageProxy',
        JSON.stringify(!!defaultImageProxy)
      );
      localStorage.setItem('imageProxyUrl', defaultImageProxy);
    }
  };

  // 检查是否显示管理面板按钮
  const showAdminPanel =
    authInfo?.role === 'owner' || authInfo?.role === 'admin';

  // 检查是否显示修改密码按钮
  const showChangePassword =
    authInfo?.role !== 'owner' && storageType !== 'localstorage';

  // 角色中文映射
  const getRoleText = (role?: string) => {
    switch (role) {
      case 'owner':
        return '站长';
      case 'admin':
        return '管理员';
      case 'user':
        return '用户';
      default:
        return '';
    }
  };

  // 菜单面板内容
  const menuPanel = (
    <>
      {/* 背景遮罩 - 普通菜单无需模糊 */}
      <div
        className='fixed inset-0 bg-transparent z-[1000]'
        onClick={handleCloseMenu}
      />

      {/* 菜单面板 */}
      <div className='fixed top-[62px] right-4 z-[1001] w-[min(92vw,280px)] overflow-hidden rounded-3xl border border-zinc-700/80 bg-black/55 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl select-none'>
        {/* 用户信息区域 */}
        <div className='border-b border-zinc-700/80 bg-black/20 px-4 py-3'>
          <div className='space-y-1'>
            <div className='flex items-center justify-between'>
              <span className='text-[11px] font-medium uppercase tracking-wider text-zinc-400'>
                当前用户
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  (authInfo?.role || 'user') === 'owner'
                    ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-300/30'
                    : (authInfo?.role || 'user') === 'admin'
                    ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-300/30'
                    : 'bg-zinc-600/40 text-zinc-200 ring-1 ring-zinc-500/40'
                }`}
              >
                {getRoleText(authInfo?.role || 'user')}
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <div className='text-sm font-medium text-zinc-100 truncate'>
                {authInfo?.username || 'default'}
              </div>
              <div className='text-[10px] text-zinc-500'>
                数据存储：
                {storageType === 'localstorage' ? '本地' : storageType}
              </div>
            </div>
          </div>
        </div>

        {/* 菜单项 */}
        <div>
          {/* 设置按钮 */}
          <button
            onClick={handleSettings}
            className='w-full px-4 py-2.5 text-left flex items-center gap-2.5 text-zinc-200 hover:bg-white/10 transition-colors text-sm'
          >
            <Settings className='w-4 h-4 text-zinc-400' />
            <span className='font-medium'>设置</span>
          </button>

          {/* 管理面板按钮 */}
          {showAdminPanel && (
            <button
              onClick={handleAdminPanel}
              className='w-full px-4 py-2.5 text-left flex items-center gap-2.5 text-zinc-200 hover:bg-white/10 transition-colors text-sm'
            >
              <Shield className='w-4 h-4 text-zinc-400' />
              <span className='font-medium'>管理面板</span>
            </button>
          )}

          {/* 修改密码按钮 */}
          {showChangePassword && (
            <button
              onClick={handleChangePassword}
              className='w-full px-4 py-2.5 text-left flex items-center gap-2.5 text-zinc-200 hover:bg-white/10 transition-colors text-sm'
            >
              <KeyRound className='w-4 h-4 text-zinc-400' />
              <span className='font-medium'>修改密码</span>
            </button>
          )}

          {/* 分割线 */}
          <div className='border-t border-zinc-700/80'></div>

          {/* 登出按钮 */}
          <button
            onClick={handleLogout}
            className='w-full px-4 py-2.5 text-left flex items-center gap-2.5 text-rose-300 hover:bg-rose-500/15 transition-colors text-sm'
          >
            <LogOut className='w-4 h-4' />
            <span className='font-medium'>登出</span>
          </button>

          {/* 分割线 */}
          <div className='border-t border-zinc-700/80'></div>

          {/* 版本信息 */}
          <button
            onClick={() =>
              window.open('https://github.com/senshinya/MoonTV', '_blank')
            }
            className='w-full px-4 py-2.5 text-center flex items-center justify-center text-zinc-400 hover:bg-white/5 transition-colors text-xs'
          >
            <div className='flex items-center gap-1'>
              <span className='font-mono'>v{CURRENT_VERSION}</span>
              {!isChecking &&
                updateStatus &&
                updateStatus !== UpdateStatus.FETCH_FAILED && (
                  <div
                    className={`w-2 h-2 rounded-full -translate-y-2 ${
                      updateStatus === UpdateStatus.HAS_UPDATE
                        ? 'bg-yellow-500'
                        : updateStatus === UpdateStatus.NO_UPDATE
                        ? 'bg-blue-400'
                        : ''
                    }`}
                  ></div>
                )}
            </div>
          </button>
        </div>
      </div>
    </>
  );

  // 设置面板内容
  const settingsPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm'
        onClick={handleCloseSettings}
      />

      {/* 设置面板 */}
      <div className='fixed top-1/2 left-1/2 z-[1001] w-[calc(100%-1rem)] sm:w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-zinc-700/80 bg-black/65 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl'>
        {/* 标题栏 */}
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-3'>
            <h3 className='text-lg font-semibold text-zinc-100'>
              本地设置
            </h3>
            <button
              onClick={handleResetSettings}
              className='rounded-md border border-rose-400/30 px-2 py-1 text-xs text-rose-300 transition-colors hover:border-rose-300/50 hover:bg-rose-500/15'
              title='重置为默认设置'
            >
              重置
            </button>
          </div>
          <button
            onClick={handleCloseSettings}
            className='flex h-8 w-8 items-center justify-center rounded-full p-1 text-zinc-400 transition-colors hover:bg-white/10'
            aria-label='Close'
          >
            <X className='w-full h-full' />
          </button>
        </div>

        {/* 设置项 */}
        <div className='space-y-6'>
          {/* 默认聚合搜索结果 */}
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-sm font-medium text-zinc-200'>
                默认聚合搜索结果
              </h4>
              <p className='mt-1 text-xs text-zinc-400'>
                搜索时默认按标题和年份聚合显示结果
              </p>
            </div>
            <label className='flex items-center cursor-pointer'>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={defaultAggregateSearch}
                  onChange={(e) => handleAggregateToggle(e.target.checked)}
                />
                <div className='h-6 w-11 rounded-full bg-zinc-700 transition-colors peer-checked:bg-blue-500'></div>
                <div className='absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5'></div>
              </div>
            </label>
          </div>

          {/* 优选和测速 */}
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-sm font-medium text-zinc-200'>
                启用优选和测速
              </h4>
              <p className='mt-1 text-xs text-zinc-400'>
                如出现播放器劫持问题可关闭
              </p>
            </div>
            <label className='flex items-center cursor-pointer'>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={enableOptimization}
                  onChange={(e) => handleOptimizationToggle(e.target.checked)}
                />
                <div className='h-6 w-11 rounded-full bg-zinc-700 transition-colors peer-checked:bg-blue-500'></div>
                <div className='absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5'></div>
              </div>
            </label>
          </div>

          {/* 分割线 */}
          <div className='border-t border-zinc-700/80'></div>

          {/* 豆瓣代理开关 */}
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-sm font-medium text-zinc-200'>
                启用豆瓣代理
              </h4>
              <p className='mt-1 text-xs text-zinc-400'>
                启用后，豆瓣数据将通过代理服务器获取
              </p>
            </div>
            <label className='flex items-center cursor-pointer'>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={enableDoubanProxy}
                  onChange={(e) => handleDoubanProxyToggle(e.target.checked)}
                />
                <div className='h-6 w-11 rounded-full bg-zinc-700 transition-colors peer-checked:bg-blue-500'></div>
                <div className='absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5'></div>
              </div>
            </label>
          </div>

          {/* 豆瓣代理地址设置 */}
          <div className='space-y-3'>
            <div>
              <h4 className='text-sm font-medium text-zinc-200'>
                豆瓣代理地址
              </h4>
              <p className='mt-1 text-xs text-zinc-400'>
                仅在启用豆瓣代理时生效，留空则使用服务器 API
              </p>
            </div>
            <input
              type='text'
              className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-transparent transition-colors ${
                enableDoubanProxy
                  ? 'border-zinc-600 bg-zinc-900/70 text-zinc-100 placeholder-zinc-500'
                  : 'border-zinc-700 bg-zinc-900/35 text-zinc-500 placeholder-zinc-600 cursor-not-allowed'
              }`}
              placeholder='例如: https://proxy.example.com/fetch?url='
              value={doubanProxyUrl}
              onChange={(e) => handleDoubanProxyUrlChange(e.target.value)}
              disabled={!enableDoubanProxy}
            />
          </div>

          {/* 分割线 */}
          <div className='border-t border-zinc-700/80'></div>

          {/* 图片代理开关 */}
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-sm font-medium text-zinc-200'>
                启用图片代理
              </h4>
              <p className='mt-1 text-xs text-zinc-400'>
                启用后，所有图片加载将通过代理服务器
              </p>
            </div>
            <label className='flex items-center cursor-pointer'>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={enableImageProxy}
                  onChange={(e) => handleImageProxyToggle(e.target.checked)}
                />
                <div className='h-6 w-11 rounded-full bg-zinc-700 transition-colors peer-checked:bg-blue-500'></div>
                <div className='absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5'></div>
              </div>
            </label>
          </div>

          {/* 图片代理地址设置 */}
          <div className='space-y-3'>
            <div>
              <h4 className='text-sm font-medium text-zinc-200'>
                图片代理地址
              </h4>
              <p className='mt-1 text-xs text-zinc-400'>
                仅在启用图片代理时生效
              </p>
            </div>
            <input
              type='text'
              className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-transparent transition-colors ${
                enableImageProxy
                  ? 'border-zinc-600 bg-zinc-900/70 text-zinc-100 placeholder-zinc-500'
                  : 'border-zinc-700 bg-zinc-900/35 text-zinc-500 placeholder-zinc-600 cursor-not-allowed'
              }`}
              placeholder='例如: https://imageproxy.example.com/?url='
              value={imageProxyUrl}
              onChange={(e) => handleImageProxyUrlChange(e.target.value)}
              disabled={!enableImageProxy}
            />
          </div>
        </div>

        {/* 底部说明 */}
        <div className='mt-6 pt-4 border-t border-zinc-700/80'>
          <p className='text-xs text-zinc-500 text-center'>
            这些设置保存在本地浏览器中
          </p>
        </div>
      </div>
    </>
  );

  // 修改密码面板内容
  const changePasswordPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm'
        onClick={handleCloseChangePassword}
      />

      {/* 修改密码面板 */}
      <div className='fixed top-1/2 left-1/2 z-[1001] w-[calc(100%-1rem)] sm:w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-zinc-700/80 bg-black/65 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl'>
        {/* 标题栏 */}
        <div className='flex items-center justify-between mb-6'>
          <h3 className='text-lg font-semibold text-zinc-100'>
            修改密码
          </h3>
          <button
            onClick={handleCloseChangePassword}
            className='flex h-8 w-8 items-center justify-center rounded-full p-1 text-zinc-400 transition-colors hover:bg-white/10'
            aria-label='Close'
          >
            <X className='w-full h-full' />
          </button>
        </div>

        {/* 表单 */}
        <div className='space-y-4'>
          {/* 新密码输入 */}
          <div>
            <label className='mb-2 block text-sm font-medium text-zinc-200'>
              新密码
            </label>
            <input
              type='password'
              className='w-full rounded-xl border border-zinc-600 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/70'
              placeholder='请输入新密码'
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </div>

          {/* 确认密码输入 */}
          <div>
            <label className='mb-2 block text-sm font-medium text-zinc-200'>
              确认密码
            </label>
            <input
              type='password'
              className='w-full rounded-xl border border-zinc-600 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/70'
              placeholder='请再次输入新密码'
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </div>

          {/* 错误信息 */}
          {passwordError && (
            <div className='rounded-xl border border-rose-400/30 bg-rose-500/15 p-3 text-sm text-rose-300'>
              {passwordError}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className='mt-6 flex gap-3 pt-4'>
          <button
            onClick={handleCloseChangePassword}
            className='flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50'
            disabled={passwordLoading}
          >
            取消
          </button>
          <button
            onClick={handleSubmitChangePassword}
            className='flex-1 rounded-xl bg-blue-600/90 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
            disabled={passwordLoading || !newPassword || !confirmPassword}
          >
            {passwordLoading ? '修改中...' : '确认修改'}
          </button>
        </div>

        {/* 底部说明 */}
        <div className='mt-4 border-t border-zinc-700/80 pt-4'>
          <p className='text-xs text-zinc-500 text-center'>
            修改密码后需要重新登录
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className='relative'>
        <button
          onClick={handleMenuClick}
          className='inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white'
          aria-label='User Menu'
        >
          <User className='h-5 w-5' />
        </button>
        {updateStatus === UpdateStatus.HAS_UPDATE && (
          <div className='absolute top-[2px] right-[2px] w-2 h-2 bg-yellow-500 rounded-full'></div>
        )}
      </div>

      {/* 使用 Portal 将菜单面板渲染到 document.body */}
      {isOpen && mounted && createPortal(menuPanel, document.body)}

      {/* 使用 Portal 将设置面板渲染到 document.body */}
      {isSettingsOpen && mounted && createPortal(settingsPanel, document.body)}

      {/* 使用 Portal 将修改密码面板渲染到 document.body */}
      {isChangePasswordOpen &&
        mounted &&
        createPortal(changePasswordPanel, document.body)}
    </>
  );
};
