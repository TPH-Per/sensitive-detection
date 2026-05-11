import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Users, ShieldCheck, Clock, Info, ChevronLeft } from 'lucide-react';

import { Button, Loading, Avatar } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { useChat } from '../hooks';
import { toast } from '../store/toastStore';
import { TOAST_MESSAGES } from '../constants';
import { AuthBrandingPanel } from '../components/layout/AuthBrandingPanel';


const JoinGroupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ token: string }>();
  const hasHandledRef = useRef(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const { user, isInitialized } = useAuthStore();
  const { fetchGroupInviteInfo, handleSelectConversation, handleJoinGroupByLink } = useChat();

  const token = params.token || '';


  useEffect(() => {
    if (!isInitialized || hasHandledRef.current) return;

    if (!token) {
      hasHandledRef.current = true;
      setErrorText('Link tham gia không hợp lệ.');
      return;
    }

    const loadGroupInfo = async () => {
      setIsFetching(true);
      try {
        const info = await fetchGroupInviteInfo(token);
        if (info.status === 'success') {
          if (info.isMember) {
            toast.info(TOAST_MESSAGES.GROUP.ALREADY_MEMBER);
            handleSelectConversation(info.convId!);
            navigate(`/?conv=${info.convId}`, { replace: true });
            return;
          }
          setGroupInfo(info);
        } else {
          const msgs = { 
            disbanded: TOAST_MESSAGES.GROUP.DISBANDED, 
            invalid: TOAST_MESSAGES.GROUP.INVALID_LINK 
          };
          setErrorText(msgs[info.status as keyof typeof msgs] || TOAST_MESSAGES.GROUP.INVALID_LINK);
        }
      } catch {
        setErrorText(TOAST_MESSAGES.GROUP.FETCH_INFO_FAILED);
      } finally {
        setIsFetching(false);
        hasHandledRef.current = true;
      }
    };

    loadGroupInfo();
  }, [isInitialized, token, user, navigate, location, fetchGroupInviteInfo, handleSelectConversation]);

  useEffect(() => {
    const pendingToken = sessionStorage.getItem('pending_join_token');
    if (user && pendingToken === token && groupInfo && !isJoining) {
      sessionStorage.removeItem('pending_join_token');
      handleJoin();
    }
  }, [user, groupInfo, token]);

  const handleJoin = async () => {
    if (!user) {
      sessionStorage.setItem('pending_join_token', token);
      navigate('/login', {
        state: { redirectTo: `${location.pathname}${location.search}` }
      });
      return;
    }

    setIsJoining(true);
    try {
      const result: any = await handleJoinGroupByLink(token);
      if (result.status === 'joined') {
        toast.success(TOAST_MESSAGES.GROUP.JOIN_SUCCESS(groupInfo?.name || ''));
        handleSelectConversation(result.convId);
        navigate(`/?conv=${result.convId}`, { replace: true });
      } else if (result.status === 'already_member') {
        toast.info(TOAST_MESSAGES.GROUP.ALREADY_MEMBER);
        handleSelectConversation(result.convId);
        navigate(`/?conv=${result.convId}`, { replace: true });
      } else if (result.status === 'pending') {
        toast.info(TOAST_MESSAGES.GROUP.PENDING_APPROVAL);
        navigate('/', { replace: true });
      }
    } catch (err) {
      toast.error(TOAST_MESSAGES.GROUP.JOIN_FAILED);
    } finally {
      setIsJoining(false);
    }
  };


  if (!isInitialized || isFetching || (!hasHandledRef.current && !errorText)) {
    return <Loading variant="page" text="Đang kiểm tra thông tin nhóm..." />;
  }

  const renderContent = () => {
    if (errorText) {
      return (
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-error/10 rounded-2xl flex items-center justify-center mx-auto text-error shadow-sm border border-error/5">
            <Info size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-text-primary">Không thể tham gia nhóm</h1>
            <p className="text-sm text-text-secondary leading-relaxed px-4">{errorText}</p>
          </div>
          <Button 
            onClick={() => navigate('/', { replace: true })} 
            variant="secondary"
            fullWidth 
            size="lg"
            icon={<ChevronLeft size={18} />}
          >
            Về trang chủ
          </Button>
        </div>
      );
    }

    if (groupInfo) {
      return (
        <div className="text-center space-y-8">
          <div className="flex flex-col items-center space-y-5">
            <Avatar
              src={groupInfo.avatar}
              name={groupInfo.name}
              size="2xl"
              isGroup={true}
              members={groupInfo.members}
            />
            
            <div className="space-y-2.5">
              <h1 className="text-3xl font-extrabold text-text-primary tracking-tight line-clamp-2">
                {groupInfo.name}
              </h1>
              <div className="flex items-center justify-center gap-5 text-sm font-semibold">
                <div className="flex items-center gap-1.5 text-text-secondary bg-bg-secondary px-3 py-1.5 rounded-full border border-border-light">
                  <Users size={16} className="text-primary" />
                  <span>{groupInfo.memberCount} thành viên</span>
                </div>
                {groupInfo.joinApprovalMode ? (
                  <div className="flex items-center gap-1.5 text-amber-500 bg-amber-500/5 px-3 py-1.5 rounded-full border border-amber-500/10">
                    <Clock size={16} />
                    <span>Cần xét duyệt</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-green-500 bg-green-500/5 px-3 py-1.5 rounded-full border border-green-500/10">
                    <ShieldCheck size={16} />
                    <span>Tham gia ngay</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Button 
              onClick={handleJoin} 
              fullWidth 
              size="lg" 
              className="h-14 text-base shadow-lg shadow-primary/20"
              isLoading={isJoining}
            >
              {!user 
                ? 'Đăng nhập để tham gia' 
                : (groupInfo.isPending ? 'Xem trạng thái yêu cầu' : (isJoining ? 'Đang tham gia...' : 'Tham gia ngay'))
              }
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')} fullWidth size="lg">
              Bỏ qua
            </Button>
          </div>


        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen lg:overflow-hidden bg-bg-secondary selection:bg-primary/20">
      <AuthBrandingPanel
        headline={<>Kết nối <br /> Nhóm mới.</>}
        subtext="Tham gia vào những cộng đồng thú vị và chia sẻ đam mê cùng Smurfy."
      />

      <div className="w-full lg:w-1/2 h-full overflow-y-auto bg-bg-primary transition-theme scroll-hide">
        <div className="min-h-full flex items-center justify-center p-6 md:p-12 animate-fade-in">
          <div className="w-full max-w-[480px]">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-10">
              <img src="/logo_text_blue.png" alt="Smurfy" className="h-10 object-contain" />
            </div>

            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};


export default JoinGroupPage;