import React, { useState, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  getWeek,
  parseISO,
  isSameDay,
  differenceInDays,
} from "date-fns";
import { 
  createEvent, 
  updateEvent, 
  deleteEvent, 
  getEvent,
  getCalendarEvents,
  addEventParticipant,
  updateEventParticipant,
  removeEventParticipant
} from "../actions/eventActions";
import eventService  from "../services/eventService";
import { AppDispatch, RootState } from "../store";
import { 
  EventCategory, 
  EventType, 
  TaskPriority, 
  ResponseStatus,
  CreateEventPayload,
  UpdateEventPayload,
  Event
} from "../types/eventTypes";
import { 
  Check, 
  Edit2, 
  Trash2, 
  UserPlus, 
  AlertCircle, 
  X, 
  Calendar, 
  CheckSquare, 
  Clock,
  ChevronRight,
  Plus,
  LogOut
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  description?: string;
  calendarId: string;
  type: "task" | "reminder" | "arrangement" | "holiday";
  color: string;
  category?: "home" | "work";
  priority?: "low" | "medium" | "high";
  isCompleted?: boolean;
  creatorId?: number;
  participations?: any[];
  deleted?: boolean;
}

export interface CalendarData {
  id: string;
  title: string;
  description: string;
  isVisible: boolean;
  color: string;
  calendarType: string;
  events?: CalendarEvent[];
  creatorId?: string;
  role?: string;
}

interface CustomCalendarProps {
  events: CalendarEvent[];
  calendars: CalendarData[];
  onAddEvent: (event: CalendarEvent) => void;
  setAlertMessage?: (message: string | null) => void;
}
const predefinedColors = [
  "#4285F4", "#DB4437", "#F4B400", "#0F9D58", 
  "#AB47BC", "#00ACC1", "#FF7043", "#9E9D24",
  "#5C6BC0", "#26A69A", "#EC407A", "#FFA726",
];

const calculateEventPositions = (
  events: CalendarEvent[],
  startHour: number,
  hourHeight: number,
  viewDate: Date
) => {
  if (!events || events.length === 0) return [];

  const isMultiDayEvent = (event: CalendarEvent): boolean => {
    if (!event.start || !event.end) return false;
    
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    
    return startDate.toDateString() !== endDate.toDateString();
  };
  
  const isContinuedFromPreviousDay = (event: CalendarEvent): boolean => {
    if (!event.start || !event.end) return false;
    
    const startDate = new Date(event.start);
    const viewDateString = format(viewDate, "yyyy-MM-dd");
    const eventStartDateString = format(startDate, "yyyy-MM-dd");
    
    return eventStartDateString !== viewDateString && isMultiDayEvent(event);
  };
  
  const continuesNextDay = (event: CalendarEvent): boolean => {
    if (!event.start || !event.end) return false;
    
    const endDate = new Date(event.end);
    const viewDateString = format(viewDate, "yyyy-MM-dd");
    const eventEndDateString = format(endDate, "yyyy-MM-dd");
    
    return eventEndDateString !== viewDateString && isMultiDayEvent(event);
  };

  const sortedEvents = events
    .slice()
    .sort((a, b) => {
      if (!a.start || !b.start) return 0;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [];

  sortedEvents.forEach((event) => {
    if (!event || !event.start) return;
    
    const eventStart = new Date(event.start);
    const eventEnd = event.end
      ? new Date(event.end)
      : new Date(eventStart.getTime() + 30 * 60000);
    
    if (currentGroup.length === 0) {
      currentGroup.push(event);
    } else {
      const overlap = currentGroup.some((ev) => {
        if (!ev || !ev.start) return false;
        
        const evStart = new Date(ev.start).getTime();
        const evEnd = ev.end
          ? new Date(ev.end).getTime()
          : new Date(ev.start).getTime() + 30 * 60000;
        
        return eventStart < evEnd && eventEnd > evStart;
      });
      
      if (overlap) {
        currentGroup.push(event);
      } else {
        groups.push(currentGroup);
        currentGroup = [event];
      }
    }
  });
  
  if (currentGroup.length) {
    groups.push(currentGroup);
  }

  const layouts: { 
    event: CalendarEvent; 
    column: number; 
    total: number;
    isMultiDay?: boolean;
    continuesNextDay?: boolean;
    continuesFromPrevDay?: boolean;
  }[] = [];
  
  groups.forEach((group) => {
    const columns: CalendarEvent[] = [];
    
    group.forEach((event) => {
      if (!event || !event.start) return;
      
      const eventStart = new Date(event.start).getTime();
      const eventEnd = event.end
        ? new Date(event.end).getTime()
        : new Date(event.start).getTime() + 30 * 60000;
      
      let placed = false;
      
      for (let i = 0; i < columns.length; i++) {
        const lastEvent = columns[i];
        if (!lastEvent || !lastEvent.start) continue;
        
        const lastEnd = lastEvent.end
          ? new Date(lastEvent.end).getTime()
          : new Date(lastEvent.start).getTime() + 30 * 60000;
        
        if (eventStart >= lastEnd) {
          columns[i] = event;
          layouts.push({ 
            event, 
            column: i, 
            total: 0,
            isMultiDay: isMultiDayEvent(event),
            continuesNextDay: continuesNextDay(event),
            continuesFromPrevDay: isContinuedFromPreviousDay(event)
          });
          placed = true;
          break;
        }
      }
      
      if (!placed) {
        columns.push(event);
        layouts.push({ 
          event, 
          column: columns.length - 1, 
          total: 0,
          isMultiDay: isMultiDayEvent(event),
          continuesNextDay: continuesNextDay(event),
          continuesFromPrevDay: isContinuedFromPreviousDay(event)
        });
      }
    });
    
    group.forEach((event) => {
      if (!event) return;
      
      const layout = layouts.find((l) => l.event.id === event.id);
      if (layout) {
        layout.total = columns.length;
      }
    });
  });

  return layouts.map((item) => {
    if (!item.event.start) return null;
    
    const eventStart = new Date(item.event.start);
    const eventEnd = item.event.end
      ? new Date(item.event.end)
      : new Date(eventStart.getTime() + 30 * 60000);
    
    const adjustedStartTime = item.continuesFromPrevDay
      ? new Date(viewDate)
      : eventStart;
    
    const nextDayStart = new Date(viewDate);
    nextDayStart.setHours(23, 59, 59, 999);
    
    const adjustedEndTime = item.continuesNextDay
      ? nextDayStart
      : eventEnd;
    
    const startMinutes = adjustedStartTime.getHours() * 60 + adjustedStartTime.getMinutes();
    const endMinutes = adjustedEndTime.getHours() * 60 + adjustedEndTime.getMinutes();
    
    const top = ((startMinutes - startHour * 60) / 60) * hourHeight;
    const height = ((endMinutes - startMinutes) / 60) * hourHeight;

    const widthPercentage = 100 / item.total;
    const leftPercentage = item.column * widthPercentage;
    
    return {
      event: item.event,
      top,
      height,
      left: leftPercentage,
      width: widthPercentage,
      isMultiDay: item.isMultiDay,
      continuesNextDay: item.continuesNextDay,
      continuesFromPrevDay: item.continuesFromPrevDay
    };
  }).filter(Boolean) as any[];
};

const getEventDays = (event: CalendarEvent): Date[] => {
  if (!event.start) return [];
  
  const startDate = new Date(event.start);
  startDate.setHours(0, 0, 0, 0);
  
  if (!event.end) return [startDate];
  
  const endDate = new Date(event.end);
  endDate.setHours(0, 0, 0, 0);
  
  if (startDate.toDateString() === endDate.toDateString()) {
    return [startDate];
  }
  
  const days: Date[] = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    days.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return days;
};

const roundToNearestThirtyMinutes = (date: Date, roundDown: boolean = true): Date => {
  const coeff = 1000 * 60 * 30;
  const result = new Date(date);
  
  if (roundDown) {
    result.setTime(Math.floor(result.getTime() / coeff) * coeff);
  } else {
    result.setTime(Math.round(result.getTime() / coeff) * coeff);
  }
  
  return result;
};

interface YearViewProps {
  year: number;
  events: CalendarEvent[];
  onDayClick: (date: string) => void;
}

const utcToLocal = (dateString: string): Date => {
  const date = new Date(dateString);
  return date;
};

const localToUTC = (date: Date): string => {
  return date.toISOString();
};

function formatDateForInput(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const YearView: React.FC<YearViewProps> = ({ year, events, onDayClick }) => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const getMultiDayEventDays = (event: CalendarEvent): string[] => {
    if (!event.start || !event.end) return [];
    
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    
    if (startDate.toDateString() === endDate.toDateString()) {
      return [];
    }
    
    const days: string[] = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      days.push(format(currentDate, "yyyy-MM-dd"));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  };

  return (
    <div className="grid grid-cols-4 gap-6 p-6 bg-slate-50 rounded-lg">
      {months.map((month, index) => {
        const monthEvents = events.filter((event) => {
          if (!event || !event.start) return false;
          
          const eventDate = new Date(event.start);
          
          if (eventDate.getFullYear() === year && eventDate.getMonth() === index) {
            return true;
          }
          
          if (event.end) {
            const multiDayDates = getMultiDayEventDays(event);
            
            return multiDayDates.some(dateStr => {
              const date = new Date(dateStr);
              return date.getFullYear() === year && date.getMonth() === index;
            });
          }
          
          return false;
        });
        
        const daysCount = new Date(year, index + 1, 0).getDate();
        const firstDayIndex = new Date(year, index, 1).getDay();
        const blanks = Array.from({ length: firstDayIndex }, () => null);
        const days = Array.from({ length: daysCount }, (_, i) => i + 1);
        const totalCells = blanks.length + days.length;
        const remainder = totalCells % 7;
        const trailingBlanks = remainder
          ? Array.from({ length: 7 - remainder }, () => null)
          : [];
        
        const allCells = [...blanks, ...days, ...trailingBlanks];
        
        return (
          <div key={month} className="bg-white shadow-sm rounded-lg overflow-hidden">
            <h3 className="text-lg font-semibold px-4 py-3 bg-indigo-50 text-indigo-800 border-b border-indigo-100">
              {month}
            </h3>
            <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500 bg-slate-50">
              <span className="py-1">Su</span>
              <span className="py-1">Mo</span>
              <span className="py-1">Tu</span>
              <span className="py-1">We</span>
              <span className="py-1">Th</span>
              <span className="py-1">Fr</span>
              <span className="py-1">Sa</span>
            </div>
            <div className="grid grid-cols-7 text-center text-sm">
              {allCells.map((cell, idx) => {
                if (cell === null) {
                  return <div key={idx} className="p-1"></div>;
                } else {
                  const date = new Date(year, index, cell);
                  const eventsForDay = monthEvents.filter(
                    (event) => {
                      if (!event || !event.start) return false;
                      
                      if (new Date(event.start).toDateString() === date.toDateString()) {
                        return true;
                      }
                      
                      if (event.end) {
                        const startDate = new Date(event.start);
                        const endDate = new Date(event.end);
                        
                        if (startDate.toDateString() !== endDate.toDateString()) {
                          return date >= startDate && date <= endDate;
                        }
                      }
                      
                      return false;
                    }
                  );
                  
                  const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                  
                  return (
                    <div
                      key={idx}
                      className={`p-1 ${isToday ? 'bg-indigo-50' : ''} rounded-full m-1 
                                 cursor-pointer hover:bg-indigo-100 transition-colors duration-200`}
                      onClick={() =>
                        onDayClick(format(date, "yyyy-MM-dd"))
                      }
                    >
                      <div className={`${isToday ? 'font-bold text-indigo-700' : ''}`}>{cell}</div>
                      {eventsForDay.length > 0 && (
                        <div className="flex justify-center space-x-1 mt-1">
                          {eventsForDay.slice(0, 3).map((event, idx) => (
                            <div
                              key={idx}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: event.color }}
                            ></div>
                          ))}
                          {eventsForDay.length > 3 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CustomCalendar: React.FC<CustomCalendarProps> = ({
  events,
  calendars,
  onAddEvent,
  setAlertMessage
}) => {
  const dispatch: AppDispatch = useDispatch();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const { currentEvent, loading, error } = useSelector((state: RootState) => state.event);
  
  const [currentView, setCurrentView] = useState<"day" | "week" | "month" | "year">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  const [showEventModal, setShowEventModal] = useState(false);
  const [showEventDetailModal, setShowEventDetailModal] = useState(false);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [participantEmail, setParticipantEmail] = useState("");
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);

  const [formParticipants, setFormParticipants] = useState<{email: string, id?: number}[]>([]);
const [newParticipantEmail, setNewParticipantEmail] = useState("");
const [isSearchingUser, setIsSearchingUser] = useState(false);
const [activeTab, setActiveTab] = useState<'details' | 'participants'>('details');
const navigate = useNavigate();

const [holidayEvent, setHolidayEvent] = useState<CalendarEvent | null>(null);
const handleEventClick = (event: CalendarEvent) => {
  if (event.type === "holiday") {
    setHolidayEvent(event);
    setShowEventDetailModal(true);
  } else {
    setSelectedEventId(parseInt(event.id));
    setShowEventDetailModal(true);
  }
};
const searchUserByEmail = async (email: string) => {
  if (!email.trim()) return null;
  
  setIsSearchingUser(true);
  try {
    const users = await eventService.findUserByEmail(email);
    if (!users || users.length === 0) {
      return null;
    }
    return users;
  } catch (error) {
    console.error("Error finding user:", error);
    return null;
  } finally {
    setIsSearchingUser(false);
  }
};

const addFormParticipant = async () => {
  if (!newParticipantEmail.trim()) return;
  
  if (formParticipants.some(p => p.email === newParticipantEmail.trim())) {
    alert("This email is already added to participants");
    return;
  }
  
  const user = await searchUserByEmail(newParticipantEmail);
  if (!user) {
    if (setAlertMessage) {
      setAlertMessage("User not found");
    }
    return;
  }
  
  setFormParticipants([...formParticipants, {
    email: newParticipantEmail,
    id: user.id
  }]);
  
  setNewParticipantEmail("");
};

const removeFormParticipant = (email: string) => {
  setFormParticipants(formParticipants.filter(p => p.email !== email));
};

  const [eventFormData, setEventFormData] = useState<{
    id?: number;
    name: string;
    description: string;
    category: EventCategory;
    startedAt: string;
    endedAt: string;
    color: string;
    type: EventType;
    calendarId: number;
    priority?: TaskPriority;
    isCompleted?: boolean;
    isEditing: boolean;
  }>({
    name: "",
    description: "",
    category: EventCategory.HOME,
    startedAt: "",
    endedAt: "",
    color: "#4CAF50",
    type: EventType.TASK,
    calendarId: calendars && calendars.length > 0 ? parseInt(calendars[0].id) : 0,
    isEditing: false
  });

  const roundToNearestFifteenMinutes = (date: Date, roundDirection: 'down' | 'nearest' = 'nearest'): Date => {
    const coeff = 1000 * 60 * 15;
    const result = new Date(date);
    
    if (roundDirection === 'down') {
      result.setTime(Math.floor(result.getTime() / coeff) * coeff);
    } else if (roundDirection === 'nearest') {
      result.setTime(Math.round(result.getTime() / coeff) * coeff);
    }
    
    return result;
  };

  const [currentNow, setCurrentNow] = useState(new Date());
  
  useEffect(() => {
    
    if (events.length > 0) {
    }
  }, [events]);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      dispatch(getEvent(selectedEventId));
    }
  }, [selectedEventId, dispatch]);

  useEffect(() => {
    if (currentEvent && currentEvent.type === "holiday") {
    }
  }, [currentEvent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputActive = activeElement instanceof HTMLInputElement || 
                            activeElement instanceof HTMLTextAreaElement ||
                            activeElement instanceof HTMLSelectElement;
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !isInputActive) {
        e.preventDefault();
        
        const now = new Date();
        const roundedStart = roundToNearestFifteenMinutes(now, 'nearest');
        
        const newEnd = new Date(roundedStart);
        newEnd.setMinutes(newEnd.getMinutes() + 30);
        
        const defaultCalendar = calendars && calendars.length > 0 ? 
          calendars.find(cal => cal.calendarType !== "holiday") || calendars[0] : null;
        
        setEventFormData({
          ...eventFormData,
          startedAt: roundedStart.toISOString(),
          endedAt: newEnd.toISOString(),
          color: defaultCalendar?.color || "#4CAF50",
          calendarId: defaultCalendar ? parseInt(defaultCalendar.id) : 0,
          isEditing: false
        });
        
        setShowEventModal(true);
      }
      
      if (e.altKey && e.key === 'e' && selectedEventId && !isInputActive) {
        e.preventDefault();
        handleEditEvent();
      }
      
      if (e.key === 'Escape') {
        if (showEventModal) {
          setShowEventModal(false);
          resetEventForm();
        }
        if (showEventDetailModal) {
          setShowEventDetailModal(false);
          setHolidayEvent(null);
        }
        if (showParticipantModal) {
          setShowParticipantModal(false);
        }
      }
    };
  
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [calendars, eventFormData, selectedEventId, showEventModal, showEventDetailModal, showParticipantModal]); // Зависимости
  
  const startHour = 0;
  const endHour = 24;
  const hourHeight = 60;
  const allDayHeight = 50;

  // =================== MONTH VIEW ===================
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDt = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDt = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const dateFormat = "d";

  const monthRows: JSX.Element[] = [];
  let monthDays: JSX.Element[] = [];
  let day = startDt;
  let formattedDate = "";

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const weekdaysHeader = (
    <div className="grid grid-cols-7 gap-1 mb-2">
      {weekdays.map((day) => (
        <div key={day} className="text-center font-medium text-slate-600 text-sm py-2">
          {day}
        </div>
      ))}
    </div>
  ); 

  while (day <= endDt) {
    for (let i = 0; i < 7; i++) {
      formattedDate = format(day, dateFormat);
      const cloneDay = day;
      const dayString = format(cloneDay, "yyyy-MM-dd");
      
      const dayEvents = events.filter(
        (event) => {
          if (!event || !event.start) return false;
          return format(new Date(event.start), "yyyy-MM-dd") === dayString;
        }
      );
      
      const isToday = dayString === format(new Date(), "yyyy-MM-dd");
      const isCurrentMonth = day.getMonth() === currentDate.getMonth();
      
      monthDays.push(
        <div
          key={day.toString()}
          className={`border rounded-lg p-2 h-32 cursor-pointer transition-all duration-200 
                     ${isToday ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'hover:bg-slate-50'}
                     ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-400'}`}
          onClick={() => {
            setCurrentDate(cloneDay);
            setCurrentView("day");
          }}
        >
          <div className={`text-xs font-semibold ${isToday ? 'text-indigo-700' : 'text-slate-700'} 
                           flex justify-between items-center`}>
            <span className={`${isToday ? 'bg-indigo-500 text-white h-6 w-6 rounded-full flex items-center justify-center' : ''}`}>
              {formattedDate}
            </span>
            {dayEvents.length > 0 && (
              <span className="text-xs text-indigo-600 font-medium">{dayEvents.length}</span>
            )}
          </div>
          {dayEvents.length > 0 && (
            <div className="mt-2 space-y-1.5 overflow-hidden">
              {(() => {
                const multiDayEvents = dayEvents.filter(event => 
                  event.end && new Date(event.start).toDateString() !== new Date(event.end).toDateString()
                );
                
                const singleDayEvents = dayEvents.filter(event => 
                  !event.end || new Date(event.start).toDateString() === new Date(event.end).toDateString()
                );
                
                const processedEvents = multiDayEvents.map(event => {
                  const eventDays = getEventDays(event);
                  const currentDayIndex = eventDays.findIndex(d => 
                    d.toDateString() === cloneDay.toDateString()
                  );
                  
                  const isFirstDay = currentDayIndex === 0;
                  const isLastDay = currentDayIndex === eventDays.length - 1;
                  
                  return {
                    ...event,
                    position: { isFirstDay, isLastDay, dayIndex: currentDayIndex, totalDays: eventDays.length }
                  };
                });
                
                const multiDayElements = processedEvents.slice(0, 2).map((event) => {
                  const calendar = calendars.find(cal => cal.id === event.calendarId) || { color: event.color };
                  const eventBgColor = event.color && event.color.trim() !== "" ? event.color : calendar.color;
                  const calendarColor = calendar?.color || "#3B82F6";
                  
                  const { isFirstDay, isLastDay } = event.position;
                  let borderRadius = '';
                  let marginLeft = '';
                  let marginRight = '';
                  let extraIndicator = '';
                  
                  if (isFirstDay && !isLastDay) {
                    borderRadius = 'rounded-l-md rounded-r-none';
                    marginRight = '-1px';
                    extraIndicator = '→';
                  } else if (!isFirstDay && isLastDay) {
                    borderRadius = 'rounded-r-md rounded-l-none';
                    marginLeft = '-1px';
                    extraIndicator = '←';
                  } else if (!isFirstDay && !isLastDay) {
                    borderRadius = 'rounded-none';
                    marginLeft = '-1px';
                    marginRight = '-1px';
                    extraIndicator = '↔';
                  }
                  
                  return (
                    <div
                      key={event.id}
                      className={`flex items-center text-xs px-2 py-1 ${borderRadius || 'rounded-md'}`}
                      style={{ 
                        backgroundColor: `${eventBgColor}15`,
                        borderLeft: isFirstDay ? `4px solid ${calendarColor}` : 'none',
                        marginLeft,
                        marginRight
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEventId(parseInt(event.id));
                        setShowEventDetailModal(true);
                      }}
                    >
                      <span className="text-xs mr-1">📆</span>
                      <span className="truncate text-slate-700">{event.title}</span>
                      {extraIndicator && (
                        <span className="ml-auto text-slate-500">{extraIndicator}</span>
                      )}
                    </div>
                  );
                });
                
                const remainingSlots = 3 - multiDayElements.length;
                const singleDayElements = singleDayEvents.slice(0, remainingSlots).map((event) => {
                  const calendar = calendars.find(cal => cal.id === event.calendarId) || { color: event.color };
                  const eventBgColor = event.color && event.color.trim() !== "" ? event.color : calendar.color;
                  const calendarColor = calendar?.color || "#3B82F6";
                  
                  let typeIcon;
                  switch(event.type) {
                    case 'arrangement':
                      typeIcon = '🗓️';
                      break;
                    case 'task':
                      typeIcon = '✓';
                      break;
                    case 'reminder':
                      typeIcon = '⏰';
                      break;
                    case 'holiday':
                      typeIcon = '🏖️';
                      break;
                    default:
                      typeIcon = '⏰';
                  }
                  
                  return (
                    <div
                      key={event.id}
                      className="flex items-center text-xs px-2 py-1 rounded-md"
                      style={{ 
                        backgroundColor: `${eventBgColor}15`,
                        borderLeft: `4px solid ${calendarColor}` 
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEventId(parseInt(event.id));
                        setShowEventDetailModal(true);
                      }}
                    >
                      <span className="text-xs mr-1">{typeIcon}</span>
                      <span className="truncate text-slate-700">{event.title}</span>
                    </div>
                  );
                });
                
                const combinedElements = [...multiDayElements, ...singleDayElements];
                const totalEvents = dayEvents.length;
                
                return (
                  <>
                    {combinedElements}
                    {/* {totalEvents > 3 && (
                      <div className="text-xs text-slate-500 italic pl-2">
                        +{totalEvents - 3} more
                      </div>
                    )} */}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      );
      day = addDays(day, 1);
    }
    monthRows.push(
      <div className="grid grid-cols-7 gap-2" key={day.toString()}>
        {monthDays}
      </div>
    );
    monthDays = [];
  }

  // =================== WEEK VIEW ===================
  const renderWeekView = () => {
    const startWeek = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }, (_, i) =>
      addDays(startWeek, i)
    );
    const hours: number[] = [];
    for (let h = startHour; h < endHour; h++) {
      hours.push(h);
    }
    const totalHeight = (endHour - startHour) * hourHeight;
  
    const isMultiDayEvent = (event: CalendarEvent): boolean => {
      if (!event.start || !event.end) return false;
      
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      
      return startDate.toDateString() !== endDate.toDateString();
    };
    
    const isEventActiveOnDay = (event: CalendarEvent, day: Date): boolean => {
      if (!event.start) return false;
      
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : new Date(eventStart.getTime() + 30 * 60000);
      
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      
      return (
        (eventStart >= dayStart && eventStart <= dayEnd) ||
        (eventEnd >= dayStart && eventEnd <= dayEnd) ||
        (eventStart <= dayStart && eventEnd >= dayEnd)
      );
    };
  
    return (
      <div className="overflow-auto relative rounded-lg shadow-sm border border-slate-200 bg-white">
        <div className="grid grid-cols-8 sticky top-0 z-10 bg-white">
          <div className="border-b border-r border-slate-200 bg-slate-50" style={{ height: allDayHeight }}></div>
          {weekDays.map((d, idx) => {
            const isToday = format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
            return (
              <div
                key={idx}
                className={`text-center font-medium border-b py-3 text-sm ${
                  isToday ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-bold">{format(d, "EEE")}</div>
                <div className={`${isToday ? 'bg-indigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto mt-1' : ''}`}>
                  {format(d, "dd")}
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="grid grid-cols-8">
          <div className="border-r border-b border-slate-200 p-2 bg-slate-50">
            <div className="text-xs font-medium text-slate-600">All Day</div>
          </div>
          {weekDays.map((dayItem, idx) => {
            const dayStr = format(dayItem, "yyyy-MM-dd");
            const isToday = dayStr === format(new Date(), "yyyy-MM-dd");
            
            const allDayEvents = events.filter(
              (event) => {
                if (!event || !event.start) return false;
                
                if (event.type === "holiday" && format(new Date(event.start), "yyyy-MM-dd") === dayStr) {
                  return true;
                }
                
                if (isMultiDayEvent(event) && isEventActiveOnDay(event, dayItem)) {
                  return true;
                }
                
                return false;
              }
            );
            
            return (
              <div
                key={idx}
                className={`border-r border-b border-slate-200 p-1 ${
                  isToday ? 'bg-indigo-50/30' : ''
                }`}
                style={{ height: allDayHeight, overflow: 'auto', maxHeight: allDayHeight * 3 }}
              >
                {allDayEvents.map((event) => {
                  const isMultiDay = isMultiDayEvent(event);
                  
                  const eventStartDate = new Date(event.start);
                  const eventEndDate = event.end ? new Date(event.end) : new Date(eventStartDate);
                  
                  const isStartDay = dayItem.toDateString() === eventStartDate.toDateString();
                  const isEndDay = dayItem.toDateString() === eventEndDate.toDateString();
                  
                  let borderRadius = "rounded-md";
                  
                  if (isMultiDay) {
                    if (!isStartDay && !isEndDay) {
                      borderRadius = "rounded-none";
                    } else if (isStartDay && !isEndDay) {
                      borderRadius = "rounded-l-md rounded-r-none";
                    } else if (!isStartDay && isEndDay) {
                      borderRadius = "rounded-r-md rounded-l-none";
                    }
                  }
                  
                  const calendar = calendars.find(cal => cal.id === event.calendarId);
                  const eventColor = event.color || calendar?.color || "#4CAF50";
                  
                  return (
                    <div
                      key={event.id}
                      className={`text-xs px-2 py-1 mb-1 truncate cursor-pointer hover:shadow-md transition-all ${borderRadius}`}
                      style={{ 
                        backgroundColor: `${eventColor}20`,
                        borderLeft: isStartDay || !isMultiDay ? `3px solid ${eventColor}` : 'none',
                        borderRight: isEndDay || !isMultiDay ? '' : 'none',
                        color: '#333'
                      }}
                      title={`${event.title}${isMultiDay ? ' (Multi-day event)' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event);
                      }}
                    >
                      <span className="mr-1">
                        {event.type === "holiday" ? "🏖️" : isMultiDay ? "📆" : "⏱️"}
                      </span>
                      {event.title}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        
        <div className="grid grid-cols-8 relative">
          <div className="relative bg-slate-50">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: `${hourHeight}px` }}
                className="border-t border-slate-200 text-right pr-2 text-xs text-slate-500 flex items-start justify-end pt-1"
              >
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour-12} PM`}
              </div>
            ))}
          </div>
{weekDays.map((dayItem, idx) => {
          const dayStr = format(dayItem, "yyyy-MM-dd");
          const isToday = dayStr === format(new Date(), "yyyy-MM-dd");
          
          const dayEvents = events.filter(
            (event) => {
              if (!event || !event.start) return false;
              
              if (event.type === "holiday") return false;
              
              if (event.end && new Date(event.start).toDateString() !== new Date(event.end).toDateString()) {
                const eventStartDay = format(new Date(event.start), "yyyy-MM-dd");
                const eventEndDay = format(new Date(event.end), "yyyy-MM-dd");
                
                if (eventStartDay === dayStr || eventEndDay === dayStr) {
                  return true;
                }
                
                const currentDay = new Date(dayStr);
                const startDate = new Date(event.start);
                const endDate = new Date(event.end);
                
                return currentDay >= startDate && currentDay <= endDate;
              }
              
              return format(new Date(event.start), "yyyy-MM-dd") === dayStr;
            }
          );
          
          
          const layouts = calculateEventPositions(
            dayEvents.filter(event => event && event.start),
            startHour,
            hourHeight,
            dayItem
          );
          
          return (
            <div
              key={idx}
              className={`relative border-l border-slate-200 ${isToday ? 'bg-indigo-50/30' : ''}`}
              style={{ height: `${totalHeight}px` }}
              onClick={(e) => handleWeekViewDoubleClick(e, dayItem)}
            >
              {hours.map((hour, i) => (
                <div
                  key={i}
                  style={{ height: `${hourHeight}px` }}
                  className="border-t border-slate-200 hover:bg-slate-100 cursor-pointer"
                ></div>
              ))}
              
              {isToday && (() => {
                const currentMinutes =
                  currentNow.getHours() * 60 + currentNow.getMinutes();
                const lineTop =
                  ((currentMinutes - startHour * 60) / 60) * hourHeight;
                return (
                  <div
                    className="absolute left-0 right-0 z-20"
                    style={{ top: lineTop }}
                  >
                    <div className="relative">
                      <div className="absolute -left-1 w-2 h-2 rounded-full bg-red-500"></div>
                      <div className="border-t-2 border-red-500 border-dashed w-full"></div>
                    </div>
                  </div>
                );
              })()}
              
              {layouts.map((layout) => {
                const calendar = calendars.find(cal => cal.id === layout.event.calendarId);
                
                if (!calendar) {
                  console.warn(`No calendar found for event ${layout.event.id} with calendarId ${layout.event.calendarId}`);
                }
                
                const calendarColor = calendar?.color || "#3B82F6";
                const eventBgColor =
                  layout.event.color && layout.event.color.trim() !== ""
                    ? layout.event.color
                    : calendarColor;
                    
                const eventStart = new Date(layout.event.start);
                const startTime = format(eventStart, 'h:mm a');
                
                let displayTime = startTime;
                let multiDayIndicator = '';
                
                if (layout.isMultiDay) {
                  if (layout.continuesFromPrevDay && layout.continuesNextDay) {
                    multiDayIndicator = '(continued → continues)';
                  } else if (layout.continuesFromPrevDay) {
                    multiDayIndicator = '(continued → ends today)';
                  } else if (layout.continuesNextDay) {
                    multiDayIndicator = '(starts today → continues)';
                  }
                }
                
                let typeIcon;
                switch(layout.event.type) {
                  case 'arrangement':
                    typeIcon = '🗓️';
                    break;
                  case 'task':
                    typeIcon = '✓';
                    break;
                  case 'reminder':
                    typeIcon = '⏰';
                    break;
                  default:
                    typeIcon = '⏰';
                }

                let borderStyle = {};
                
                if (layout.isMultiDay) {
                  if (layout.continuesFromPrevDay && layout.continuesNextDay) {
                    borderStyle = {
                      borderLeft: `4px solid ${calendarColor}`,
                      borderTop: '2px dashed #ccc',
                      borderBottom: '2px dashed #ccc'
                    };
                  } else if (layout.continuesFromPrevDay) {
                    borderStyle = {
                      borderLeft: `4px solid ${calendarColor}`,
                      borderTop: '2px dashed #ccc'
                    };
                  } else if (layout.continuesNextDay) {
                    borderStyle = {
                      borderLeft: `4px solid ${calendarColor}`,
                      borderBottom: '2px dashed #ccc'
                    };
                  } else {
                    borderStyle = {
                      borderLeft: `4px solid ${calendarColor}`
                    };
                  }
                } else {
                  borderStyle = {
                    borderLeft: `4px solid ${calendarColor}`
                  };
                }
                
                return (
                  <div
                    key={layout.event.id}
                    data-event-id={layout.event.id}
                    style={{
                      top: `${layout.top}px`,
                      height: `${layout.height}px`,
                      left: `${layout.left}%`,
                      width: `calc(${layout.width}% - 4px)`,
                      position: "absolute",
                      marginLeft: "2px",
                      padding: "4px",
                      backgroundColor: `${eventBgColor}15`,
                      ...borderStyle
                    }}
                    className="text-xs rounded-md shadow-sm overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md group"
                    title={`${layout.event.title}${layout.isMultiDay ? ' (Multi-day event)' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEventId(parseInt(layout.event.id));
                      setShowEventDetailModal(true);
                    }}
                  >
                    <div className="font-semibold text-slate-700 truncate flex items-center">
                      <span className="mr-1">{typeIcon}</span>
                      {layout.event.title}
                    </div>
                    <div className="text-slate-500 text-xs flex items-center">
                      <span>{displayTime}</span>
                      {multiDayIndicator && (
                        <span className="ml-1 text-xs text-indigo-600">{multiDayIndicator}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
  // =================== DAY VIEW ===================
  const renderDayView = () => {
    const dayStr = format(currentDate, "yyyy-MM-dd");
    const isToday = dayStr === format(new Date(), "yyyy-MM-dd");
    
    const allDayEvents = events.filter(
      (event) => {
        if (!event || !event.start) return false;
    
        if (event.type === "holiday" && format(new Date(event.start), "yyyy-MM-dd") === dayStr) {
          return true;
        }
        
        if (event.end) {
          const startDate = new Date(event.start);
          const endDate = new Date(event.end);

          if (startDate.toDateString() !== endDate.toDateString()) {
            const currentDay = new Date(dayStr);
            currentDay.setHours(0, 0, 0, 0);
            
            const nextDay = new Date(currentDay);
            nextDay.setDate(nextDay.getDate() + 1);
            
            if (
              (format(startDate, "yyyy-MM-dd") === dayStr) ||
              (currentDay >= startDate && currentDay < endDate)
            ) {
              return true;
            }
          }
        }
        
        return false;
      }
    );
    
    const timedEvents = events.filter(
      (event) => {
        if (!event || !event.start) return false;
        
        if (event.type === "holiday") return false;
        
        if (event.end) {
          const startDate = new Date(event.start);
          const endDate = new Date(event.end);
          if (startDate.toDateString() !== endDate.toDateString()) {
            return false;
          }
        }
        
        return format(new Date(event.start), "yyyy-MM-dd") === dayStr;
      }
    );
    
    
    const hours: number[] = [];
    for (let h = startHour; h < endHour; h++) {
      hours.push(h);
    }
    
    const totalHeight = (endHour - startHour) * hourHeight;
    
    const layouts = calculateEventPositions(
      timedEvents.filter(event => event && event.start),
      startHour,
      hourHeight,
      currentDate
    );
  
    return (
      <div className="overflow-auto relative rounded-lg shadow-sm border border-slate-200 bg-white">
        <div className={`py-4 px-6 font-medium text-center border-b ${isToday ? 'bg-indigo-50' : 'bg-slate-50'}`}>
          <span className="text-lg font-bold mr-2 text-slate-800">
            {format(currentDate, "EEEE")}
          </span>
          <span className={`text-md ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>
            {format(currentDate, "MMMM d, yyyy")}
            {isToday && <span className="ml-2 bg-indigo-600 text-white text-xs py-0.5 px-2 rounded-full">Today</span>}
          </span>
        </div>
        
        <div className={`border-b border-slate-200 p-3 ${isToday ? 'bg-indigo-50/30' : 'bg-slate-50/30'}`}>
          <div className="flex items-center mb-2">
            <div className="text-sm font-medium text-slate-700 min-w-[80px]">All Day</div>
          </div>
          <div className="space-y-1.5 ml-[80px]">
            {allDayEvents.length > 0 ? allDayEvents.map((event) => {
              const isMultiDay = event.end && new Date(event.start).toDateString() !== new Date(event.end).toDateString();
              
              const eventStartDate = new Date(event.start);
              const eventEndDate = event.end ? new Date(event.end) : new Date(eventStartDate);
              const viewDate = new Date(dayStr);
              
              const isStartDay = viewDate.toDateString() === eventStartDate.toDateString();
              const isEndDay = viewDate.toDateString() === eventEndDate.toDateString();
              
              let borderRadius = "rounded-md";
              let eventWidth = "w-full";
              
              if (isMultiDay) {
                if (!isStartDay && !isEndDay) {
                  borderRadius = "rounded-none";
                  eventWidth = "w-full";
                } else if (isStartDay && !isEndDay) {
                  borderRadius = "rounded-l-md rounded-r-none";
                  eventWidth = "w-full";
                } else if (!isStartDay && isEndDay) {
                  borderRadius = "rounded-r-md rounded-l-none";
                  eventWidth = "w-full";
                }
              }
              
              let dateRangeText = "";
              if (isMultiDay) {
                if (isStartDay) {
                  dateRangeText = `→ ${format(eventEndDate, "MMM d")}`;
                } else if (isEndDay) {
                  dateRangeText = `${format(eventStartDate, "MMM d")} →`;
                } else {
                  dateRangeText = `${format(eventStartDate, "MMM d")} → ${format(eventEndDate, "MMM d")}`;
                }
              }
              
              const calendar = calendars.find(cal => cal.id === event.calendarId);
              const eventColor = event.color || calendar?.color || "#4CAF50";
              
              return (
                <div
                  key={event.id}
                  className={`text-xs px-3 py-1.5 flex items-center cursor-pointer hover:shadow-md transition-all ${borderRadius} ${eventWidth}`}
                  style={{
                    backgroundColor: `${eventColor}15`,
                    borderLeft: `3px solid ${eventColor}`,
                    color: '#333',
                    ...(isMultiDay && !isStartDay ? { borderLeft: 'none' } : {}),
                    ...(isMultiDay && !isEndDay ? { borderRight: 'none' } : {})
                  }}
                  title={event.title}
                  onClick={() => handleEventClick(event)}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <span className="mr-1">
                        {event.type === "holiday" ? "🏖️" : isMultiDay ? "📆" : "⏱️"}
                      </span>
                      <span className="font-medium">{event.title}</span>
                    </div>
                    {isMultiDay && dateRangeText && (
                      <span className="ml-2 text-xs text-gray-500">{dateRangeText}</span>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div className="text-xs text-slate-500 italic">No all-day events</div>
            )}
          </div>
        </div>
  
        <div className="grid" style={{ gridTemplateColumns: "80px 1fr" }}>
          <div className="relative bg-slate-50">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: `${hourHeight}px` }}
                className="border-t border-slate-200 text-right pr-3 text-xs text-slate-500 flex items-start justify-end pt-2"
              >
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour-12} PM`}
              </div>
            ))}
          </div>
          <div
            className={`relative border-l border-slate-200 ${isToday ? 'bg-indigo-50/20' : ''}`}
            style={{ height: `${totalHeight}px` }}
            onClick={handleDayViewDoubleClick}
          >
            {hours.map((hour, i) => (
              <div
                key={i}
                style={{ height: `${hourHeight}px` }}
                className="border-t border-slate-200 hover:bg-slate-100 cursor-pointer"
              ></div>
            ))}
            
            {isToday && (() => {
              const currentMinutes =
                currentNow.getHours() * 60 + currentNow.getMinutes();
              const lineTop =
                ((currentMinutes - startHour * 60) / 60) * hourHeight;
              return (
                <div
                  className="absolute left-0 right-0 z-20"
                  style={{ top: lineTop }}
                >
                  <div className="relative">
                    <div className="absolute -left-2 w-4 h-4 rounded-full bg-red-500 shadow"></div>
                    <div className="border-t-2 border-red-500 w-full"></div>
                  </div>
                </div>
              );
            })()}
            
            {layouts.map((layout) => {
              // Find the calendar this event belongs to
              const calendar = calendars.find(cal => cal.id === layout.event.calendarId);
              
              if (!calendar) {
                console.warn(`No calendar found for event ${layout.event.id} with calendarId ${layout.event.calendarId}`);
              }
              
              const calendarColor = calendar?.color || "#3B82F6";
              const eventBgColor =
                layout.event.color && layout.event.color.trim() !== ""
                  ? layout.event.color
                  : calendarColor;
                  
              // Get event time for display
              const eventStart = new Date(layout.event.start);
              const eventEnd = layout.event.end ? new Date(layout.event.end) : 
                              new Date(eventStart.getTime() + 30 * 60000);
              
              // Adjust time display for multi-day events
              let timeRange = `${format(eventStart, 'h:mm')} - ${format(eventEnd, 'h:mm a')}`;
              
              if (layout.continuesFromPrevDay) {
                timeRange = `(continued) - ${format(eventEnd, 'h:mm a')}`;
              } else if (layout.continuesNextDay) {
                timeRange = `${format(eventStart, 'h:mm')} - (continues)`;
              }
              
              // Get the right icon for the event type
              let typeIcon;
              switch(layout.event.type) {
                case 'arrangement':
                  typeIcon = '🗓️';
                  break;
                case 'task':
                  typeIcon = '✓';
                  break;
                case 'reminder':
                  typeIcon = '⏰';
                  break;
                default:
                  typeIcon = '⏰';
              }
              
              // Add visual indicators for multi-day events
              let borderStyle = {};
              
              if (layout.isMultiDay) {
                if (layout.continuesFromPrevDay && layout.continuesNextDay) {
                  // Event continues both from previous day and to next day
                  borderStyle = {
                    borderLeft: `4px solid ${calendarColor}`,
                    borderTop: '2px dashed #ccc',
                    borderBottom: '2px dashed #ccc'
                  };
                } else if (layout.continuesFromPrevDay) {
                  // Event continues from previous day
                  borderStyle = {
                    borderLeft: `4px solid ${calendarColor}`,
                    borderTop: '2px dashed #ccc'
                  };
                } else if (layout.continuesNextDay) {
                  // Event continues to next day
                  borderStyle = {
                    borderLeft: `4px solid ${calendarColor}`,
                    borderBottom: '2px dashed #ccc'
                  };
                } else {
                  borderStyle = {
                    borderLeft: `4px solid ${calendarColor}`
                  };
                }
              } else {
                borderStyle = {
                  borderLeft: `4px solid ${calendarColor}`
                };
              }
              
              return (
                <div
                  key={layout.event.id}
                  data-event-id={layout.event.id}
                  style={{
                    top: `${layout.top}px`,
                    height: `${Math.max(layout.height, 30)}px`,
                    left: `${layout.left}%`,
                    width: `calc(${layout.width}% - 10px)`,
                    position: "absolute",
                    marginLeft: "5px",
                    padding: "6px 8px",
                    backgroundColor: `${eventBgColor}15`,
                    ...borderStyle
                  }}
                  className="rounded-md shadow-sm overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md group"
                  title={layout.event.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEventId(parseInt(layout.event.id));
                    setShowEventDetailModal(true);
                  }}
                >
                  <div className="font-semibold text-slate-800 truncate flex items-center">
                    <span className="mr-1">{typeIcon}</span>
                    {layout.event.title}
                    {layout.isMultiDay && (
                      <span className="ml-1 text-xs bg-indigo-100 text-indigo-800 px-1 rounded">
                        multi-day
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 text-xs">{timeRange}</div>
                  {layout.height > 60 && layout.event.description && (
                    <div className="text-xs text-slate-600 mt-1 opacity-75 group-hover:opacity-100 line-clamp-2">
                      {layout.event.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // =================== YEAR VIEW ===================
  const renderYearView = () => (
    <YearView
      year={currentYear}
      events={events}
      onDayClick={(dateStr: string) => {
        setCurrentDate(new Date(dateStr));
        setCurrentView("day");
      }}
    />
  );

  const handlePrev = () => {
    if (currentView === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (currentView === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else if (currentView === "day") {
      setCurrentDate(addDays(currentDate, -1));
    } else if (currentView === "year") {
      setCurrentYear((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentView === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (currentView === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else if (currentView === "day") {
      setCurrentDate(addDays(currentDate, 1));
    } else if (currentView === "year") {
      setCurrentYear((prev) => prev + 1);
    }
  };

  const handleToday = () => {
    if (currentView === "year") {
      setCurrentYear(new Date().getFullYear());
    } else {
      setCurrentDate(new Date());
    }
  };

  const handleDayViewDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const hourFraction = offsetY / hourHeight;
    const clickedHour = startHour + hourFraction;
    
    const newStart = new Date(currentDate);
    const hoursPart = Math.floor(clickedHour);
    const minutesPart = Math.floor((clickedHour - hoursPart) * 60);
    newStart.setHours(hoursPart, minutesPart, 0, 0);
    
    const roundedStart = roundToNearestFifteenMinutes(newStart, 'nearest');
    
    const newEnd = new Date(roundedStart);
    newEnd.setMinutes(newEnd.getMinutes() + 30);
    
    const defaultCalendar = calendars && calendars.length > 0 ? 
      calendars.find(cal => cal.calendarType !== "holiday") || calendars[0] : null;
  
    setEventFormData({
      ...eventFormData,
      startedAt: roundedStart.toISOString(),
      endedAt: newEnd.toISOString(),
      color: defaultCalendar?.color || "#4CAF50",
      calendarId: defaultCalendar ? parseInt(defaultCalendar.id) : 0,
      isEditing: false
    });
    
    setShowEventModal(true);
  };
  const handleWeekViewDoubleClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const hourFraction = offsetY / hourHeight;
    const clickedHour = startHour + hourFraction;
    
    const newStart = new Date(day);
    const hoursPart = Math.floor(clickedHour);
    const minutesPart = Math.floor((clickedHour - hoursPart) * 60);
    newStart.setHours(hoursPart, minutesPart, 0, 0);
    
    const roundedStart = roundToNearestFifteenMinutes(newStart, 'nearest');
    
    const newEnd = new Date(roundedStart);
    newEnd.setMinutes(newEnd.getMinutes() + 30);
    
    const defaultCalendar = calendars && calendars.length > 0 ? 
      calendars.find(cal => cal.calendarType !== "holiday") || calendars[0] : null;
  
    setEventFormData({
      ...eventFormData,
      startedAt: roundedStart.toISOString(),
      endedAt: newEnd.toISOString(),
      color: defaultCalendar?.color || "#4CAF50",
      calendarId: defaultCalendar ? parseInt(defaultCalendar.id) : 0,
      isEditing: false
    });
    
    setShowEventModal(true);
  };

  const handleEventFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (eventFormData.isEditing && eventFormData.id) {
        const updatePayload: UpdateEventPayload = {
          name: eventFormData.name,
          description: eventFormData.description,
          category: eventFormData.category,
          startedAt: localToUTC(new Date(eventFormData.startedAt)),
          endedAt: localToUTC(new Date(eventFormData.endedAt)),
        };
        
        if (currentEvent?.type === EventType.TASK) {
          updatePayload.priority = eventFormData.priority;
          updatePayload.isCompleted = eventFormData.isCompleted;
        }
        
        const updatedEvent = await dispatch(updateEvent(eventFormData.id, updatePayload));
        console.log("Event updated:", updatedEvent);
        if (setAlertMessage) {
          setAlertMessage("Event updated successfully");
        }
        if (currentEvent?.participations && currentEvent.participations.length > 0) {
          const calendarMemberId = currentEvent.participations[0].calendarMemberId;
          
          if (calendarMemberId) {
            const currentColor = currentEvent.participations[0].color;
            if (currentColor !== eventFormData.color) {
              await dispatch(updateEventParticipant(
                eventFormData.id, 
                calendarMemberId, 
                { color: eventFormData.color }
              ));
            }
          }
        }
        
        if (currentEvent?.type === EventType.ARRANGEMENT) {
          const currentParticipantIds = currentEvent.participations
            ? currentEvent.participations.map(p => p.calendarMember?.user?.id).filter(Boolean)
            : [];
          
          const newParticipantIds = formParticipants.map(p => p.id).filter(Boolean);
          
          const calendarId = currentEvent.participations?.[0]?.calendarMember?.calendarId;
          
          if (calendarId) {
            for (const p of currentEvent.participations || []) {
              if (p.calendarMember?.user?.id && !newParticipantIds.includes(p.calendarMember.user.id)) {
                await dispatch(removeEventParticipant(currentEvent.id, p.calendarMemberId));
              }
            }
            
            for (const participant of formParticipants) {
              if (participant.id && !currentParticipantIds.includes(participant.id)) {
                await dispatch(addEventParticipant(currentEvent.id, calendarId, participant.email));
              }
            }
          }
        }
        
        if (currentEvent?.participations && currentEvent.participations.length > 0) {
          const calendarId = currentEvent.participations[0].calendarMember?.calendarId;
          if (calendarId && authUser?.id) {
            const updatedEvents = await dispatch(getCalendarEvents(calendarId, authUser.id));
            console.log("Updated events after edit:", updatedEvents);
            
            if (onAddEvent && typeof onAddEvent === 'function') {
              const syntheticEvent = {
                id: String(updatedEvent.id),
                title: updatedEvent.name,
                start: updatedEvent.startedAt,
                calendarId: String(calendarId),
                type: updatedEvent.type,
                color: eventFormData.color
              };
              onAddEvent(syntheticEvent);
            }
          }
        }
      } else {
        const createPayload: CreateEventPayload = {
          name: eventFormData.name,
          description: eventFormData.description,
          category: eventFormData.category,
          startedAt: localToUTC(new Date(eventFormData.startedAt)),
          endedAt: localToUTC(new Date(eventFormData.endedAt)),
          color: eventFormData.color || 
                 calendars.find(cal => cal.id === String(eventFormData.calendarId))?.color || 
                 "#4CAF50",
          type: eventFormData.type,
          calendarId: eventFormData.calendarId
        };
        
        if (eventFormData.type === EventType.TASK && eventFormData.priority) {
          createPayload.priority = eventFormData.priority;
        }
        
        if (eventFormData.type === EventType.ARRANGEMENT && formParticipants.length > 0) {
          createPayload.participantIds = formParticipants
            .map(p => p.id)
            .filter(Boolean) as number[];
        }
        
        const newEvent = await dispatch(createEvent(createPayload));
        if (setAlertMessage) {
          setAlertMessage("Event created successfully");
        }
        if (authUser?.id) {
          const updatedEvents = await dispatch(getCalendarEvents(eventFormData.calendarId, authUser.id));
          
          if (onAddEvent && typeof onAddEvent === 'function') {
            const syntheticEvent = {
              id: String(newEvent.id),
              title: newEvent.name,
              start: newEvent.startedAt,
              calendarId: String(eventFormData.calendarId),
              type: newEvent.type,
              color: createPayload.color
            };
            onAddEvent(syntheticEvent);
          }
        }
      }
      
      setShowEventModal(false);
      resetEventForm();
    } catch (error) {
      if (setAlertMessage) {
        setAlertMessage("Error saving event. Please try again.");
      }
      console.error("Error saving event:", error);
      if (!showEventModal) {
        resetEventForm();
      }
    }
  };

const handleEditEvent = () => {
  if (!currentEvent) return;
  
  const currentParticipants: {email: string, id?: number}[] = [];
  if (currentEvent.type === EventType.ARRANGEMENT && currentEvent.participations) {
    currentEvent.participations.forEach(p => {
      if (p.calendarMember && p.calendarMember.user) {
        currentParticipants.push({
          email: p.calendarMember.user.email,
          id: p.calendarMember.user.id
        });
      }
    });
  }
  
  const eventColor = currentEvent.participations?.[0]?.color || 
                     calendars.find(cal => cal.id === String(currentEvent.participations?.[0]?.calendarMember?.calendarId))?.color || 
                     "#4CAF50";
  
  setFormParticipants(currentParticipants);
  
  setEventFormData({
    id: currentEvent.id,
    name: currentEvent.name,
    description: currentEvent.description,
    category: currentEvent.category,
    startedAt: currentEvent.startedAt,
    endedAt: currentEvent.endedAt,
    color: eventColor,
    type: currentEvent.type,
    calendarId: currentEvent.participations?.[0]?.calendarMember?.calendarId || 0,
    priority: currentEvent.task?.priority,
    isCompleted: currentEvent.task?.isCompleted,
    isEditing: true
  });
  
  setShowEventDetailModal(false);
  setHolidayEvent(null);
  setShowEventModal(true);
};

const handleDeleteEvent = async () => {
  if (!currentEvent) return;
  
  try {
    await dispatch(deleteEvent(currentEvent.id));
    console.log("Event deleted:", currentEvent.id);
    if (setAlertMessage) {
      setAlertMessage("Event deleted successfully");
    }
    let calendarId: string | number | undefined;
    if (currentEvent.participations && currentEvent.participations.length > 0) {
      calendarId = currentEvent.participations[0].calendarMember?.calendarId;
    } else if (currentEvent.calendarId) {
      calendarId = currentEvent.calendarId;
    }
    
    if (calendarId && onAddEvent && typeof onAddEvent === 'function') {
      const deletionEvent = {
        id: String(currentEvent.id),
        calendarId: String(calendarId),
        deleted: true,
        title: currentEvent.name || "",
        start: currentEvent.startedAt || "",
        type: currentEvent.type || "task"
      };
      onAddEvent(deletionEvent);
    }
    
    setShowEventDetailModal(false);
    setHolidayEvent(null);
  } catch (error) {
    if (setAlertMessage) {
      setAlertMessage("Error deleting event. Please try again");
    }
    console.error("Error deleting event:", error);
  }
};

  const resetEventForm = () => {
  const defaultCalendar = calendars && calendars.length > 0 ? 
    calendars.find(cal => cal.calendarType !== "holiday") || calendars[0] : null;
  
  const now = new Date();
  const roundedStart = roundToNearestFifteenMinutes(now, 'nearest');
  const newEnd = new Date(roundedStart);
  newEnd.setMinutes(newEnd.getMinutes() + 30);
  
  setEventFormData({
    name: "",
    description: "",
    category: EventCategory.HOME,
    startedAt: roundedStart.toISOString(),
    endedAt: newEnd.toISOString(),
    color: defaultCalendar?.color || "#4CAF50",
    type: EventType.TASK,
    calendarId: defaultCalendar ? parseInt(defaultCalendar.id) : 0,
    priority: TaskPriority.MEDIUM,
    isCompleted: false,
    isEditing: false
  });
  
  setFormParticipants([]);
  setNewParticipantEmail("");
  
  setSelectedEventId(null);
}

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !participantEmail.trim()) return;
    
    setIsAddingParticipant(true);
    
    try {
      const calendarId = currentEvent?.participations?.[0]?.calendarMember?.calendarId;
      if (!calendarId) throw new Error("Calendar ID not found");
      
      const result = await dispatch(addEventParticipant(selectedEventId, calendarId, participantEmail));
      console.log("Added participant:", result);
      if (setAlertMessage) {
        setAlertMessage("Participant added successfully");
      }
      setParticipantEmail("");
      
      await dispatch(getEvent(selectedEventId));
      
      if (authUser?.id) {
        const updatedEvents = await dispatch(getCalendarEvents(calendarId, authUser.id));
        console.log("Updated events after adding participant:", updatedEvents);
      }
    } catch (error) {
      console.error("Error adding participant:", error);
      if (setAlertMessage) {
        setAlertMessage("Error adding participant. Please try again");
      }
    } finally {
      setIsAddingParticipant(false);
    }
  };

  const handleUpdateParticipantStatus = async (calendarMemberId: number, status: string) => {
    if (!selectedEventId) return;
    
    try {
      const result = await dispatch(updateEventParticipant(selectedEventId, calendarMemberId, { responseStatus: status }));
      console.log("Updated participant status:", result);
      if (setAlertMessage) {
        setAlertMessage("Status updated successfully");
      }
      await dispatch(getEvent(selectedEventId));
      
      if (currentEvent?.participations && currentEvent.participations.length > 0) {
        const calendarId = currentEvent.participations[0].calendarMember?.calendarId;
        if (calendarId && authUser?.id) {
          const updatedEvents = await dispatch(getCalendarEvents(calendarId, authUser.id));
          console.log("Updated events after status change:", updatedEvents);
        }
      }
    } catch (error) {
      if (setAlertMessage) {
        setAlertMessage("Error updating status. Please try again");
      }
      console.error("Error updating participant status:", error);
    }
  };

  const handleRemoveParticipant = async (calendarMemberId: number) => {
    if (!selectedEventId) return;
    
    try {
      await dispatch(removeEventParticipant(selectedEventId, calendarMemberId));
      console.log("Removed participant:", calendarMemberId);
      if (setAlertMessage) {
        setAlertMessage("Participant removed successfully");
      }
      await dispatch(getEvent(selectedEventId));

      if (currentEvent?.participations && currentEvent.participations.length > 0) {
        const calendarId = currentEvent.participations[0].calendarMember?.calendarId;
        if (calendarId && authUser?.id) {
          const updatedEvents = await dispatch(getCalendarEvents(calendarId, authUser.id));
          console.log("Updated events after removing participant:", updatedEvents);
        }
      }
    } catch (error) {
      console.error("Error removing participant:", error);
      if (setAlertMessage) {
        setAlertMessage("Error removing participant. Please try again");
      }
    }
  };

  const canManageParticipants = useMemo(() => {
    if (!currentEvent) return false;
    
    if (currentEvent.type !== EventType.ARRANGEMENT) return false;
    
    if (currentEvent.creatorId === authUser?.id) return true;
    
    const userRole = currentEvent.participations?.find(
      p => p.calendarMember?.userId === authUser?.id
    )?.calendarMember?.role;
    
    return userRole === 'owner' || userRole === 'editor';
  }, [currentEvent, authUser]);

  const canEditEvent = useMemo(() => {
    if (!currentEvent) return false;
    
    if (currentEvent.creatorId === authUser?.id) return true;
    
    const userRole = currentEvent.participations?.find(
      p => p.calendarMember?.userId === authUser?.id
    )?.calendarMember?.role?.toLowerCase();
    
    return userRole === 'owner' || userRole === 'editor';
  }, [currentEvent, authUser]);

  const canDeleteEvent = useMemo(() => {
    if (!currentEvent) return false;
    
    if (currentEvent.creatorId === authUser?.id) return true;
    
    const userRole = currentEvent.participations?.find(
      p => p.calendarMember?.userId === authUser?.id
    )?.calendarMember?.role?.toLowerCase();
    
    return userRole === 'owner';
  }, [currentEvent, authUser]);

const renderEventModal = () => {
  const eventColor = eventFormData.color || "#4CAF50";
  
  let typeIcon;
  let typeColor;
  let typeBgColor;
  let typeLabel;
  
  switch(eventFormData.type) {
    case EventType.ARRANGEMENT:
      typeIcon = <Calendar className="h-5 w-5" />;
      typeColor = "text-indigo-600";
      typeBgColor = "bg-indigo-50";
      typeLabel = "Arrangement";
      break;
    case EventType.TASK:
      typeIcon = <CheckSquare className="h-5 w-5" />;
      typeColor = "text-emerald-600";
      typeBgColor = "bg-emerald-50";
      typeLabel = "Task";
      break;
    case EventType.REMINDER:
      typeIcon = <Clock className="h-5 w-5" />;
      typeColor = "text-amber-600";
      typeBgColor = "bg-amber-50";
      typeLabel = "Reminder";
      break;
    default:
      typeIcon = <Clock className="h-5 w-5" />;
      typeColor = "text-amber-600";
      typeBgColor = "bg-amber-50";
      typeLabel = eventFormData.isEditing ? "Edit Event" : "New Event";
  }
  
  const selectedCalendar = calendars.find(cal => cal.id === String(eventFormData.calendarId));
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        <form onSubmit={handleEventFormSubmit}>
          <div 
            className="px-6 py-5 relative overflow-hidden"
            style={{ 
              backgroundColor: eventColor,
              color: '#fff'
            }}
          >
            <div className="absolute -right-12 -top-10 w-32 h-32 rounded-full bg-white opacity-10"></div>
            <div className="absolute -right-5 -bottom-20 w-40 h-40 rounded-full bg-white opacity-5"></div>
            
            <div className="flex justify-between items-start relative z-10">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-2.5 py-1 text-sm font-medium rounded-full ${typeBgColor} ${typeColor}`}>
                    {eventFormData.isEditing ? `Edit ${typeLabel}` : `New ${typeLabel}`}
                  </span>
                  
                  {selectedCalendar && (
                    <span className="flex items-center space-x-1 text-xs text-white/70">
                      <span className="w-2 h-2 rounded-full bg-white inline-block"></span>
                      <span>{selectedCalendar.title || "Calendar"}</span>
                    </span>
                  )}
                </div>
                
                <input
                  type="text"
                  value={eventFormData.name}
                  onChange={(e) => setEventFormData({ ...eventFormData, name: e.target.value })}
                  className="bg-transparent border-b border-white/30 text-white text-xl font-bold w-full focus:outline-none focus:border-white placeholder-white/50 pb-1 mb-3"
                  placeholder="Add title"
                  required
                  autoFocus
                />
              </div>
              
              <button 
                type="button"
                onClick={() => {
                  setShowEventModal(false);
                  resetEventForm();
                }}              
                className="p-1 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={24} className="text-white" />
              </button>
            </div>
          </div>
          
          <div className="p-6 overflow-y-auto max-h-[calc(100vh-250px)]">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Start Date & Time
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Clock size={16} className="text-gray-400" />
                    </div>
                    <input
  type="datetime-local"
  value={eventFormData.startedAt ? formatDateForInput(eventFormData.startedAt) : ""}
  onChange={(e) => {
    if (e.target.value) {
      setEventFormData({ 
        ...eventFormData, 
        startedAt: new Date(e.target.value).toISOString()
      });
    }
  }}
  step="900"
  className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
  required
/>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    End Date & Time
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Clock size={16} className="text-gray-400" />
                    </div>
                    <input
  type="datetime-local"
  value={eventFormData.endedAt ? formatDateForInput(eventFormData.endedAt) : ""}
  onChange={(e) => {
    if (e.target.value) {
      setEventFormData({ 
        ...eventFormData, 
        endedAt: new Date(e.target.value).toISOString()
      });
    }
  }}
  step="900"
  className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
  required
/>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={eventFormData.description}
                  onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                  placeholder="Add a description (optional)"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Category
                  </label>
                  <div className="relative">
                    <select
                      value={eventFormData.category}
                      onChange={(e) => setEventFormData({ 
                        ...eventFormData, 
                        category: e.target.value as EventCategory 
                      })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none"
                    >
                      <option value={EventCategory.HOME}>Home</option>
                      <option value={EventCategory.WORK}>Work</option>
                    </select>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      {eventFormData.category === EventCategory.HOME ? (
                        <span className="text-gray-500">🏠</span>
                      ) : (
                        <span className="text-gray-500">💼</span>
                      )}
                    </div>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </div>
                </div>
                
                {!eventFormData.isEditing && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Event Type
                    </label>
                    <div className="relative">
                      <select
                        value={eventFormData.type}
                        onChange={(e) => setEventFormData({ 
                          ...eventFormData, 
                          type: e.target.value as EventType 
                        })}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none"
                      >
                        <option value={EventType.TASK}>Task</option>
                        <option value={EventType.REMINDER}>Reminder</option>
                        <option value={EventType.ARRANGEMENT}>Arrangement</option>
                      </select>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {eventFormData.type === EventType.TASK ? (
                          <CheckSquare size={16} className="text-gray-500" />
                        ) : eventFormData.type === EventType.ARRANGEMENT ? (
                          <Calendar size={16} className="text-gray-500" />
                        ) : (
                          <Clock size={16} className="text-gray-500" />
                        )}
                      </div>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <ChevronRight size={16} className="text-gray-400" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {(eventFormData.type === EventType.ARRANGEMENT && !eventFormData.isEditing) && (
  <div className="border-t pt-4 mt-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-gray-700">Participants</h3>
      <div className="text-xs text-gray-500">{formParticipants.length} people</div>
    </div>
    
    <div className="flex mb-4">
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <UserPlus size={16} className="text-gray-400" />
        </div>
        <input
          type="email"
          value={newParticipantEmail}
          onChange={(e) => setNewParticipantEmail(e.target.value)}
          placeholder="Enter email address"
          className="pl-10 w-full border border-gray-300 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      <button
        type="button"
        onClick={addFormParticipant}
        disabled={isSearchingUser || !newParticipantEmail.trim()}
        className="bg-indigo-600 text-white px-4 py-2 rounded-r-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 flex items-center"
      >
        {isSearchingUser ? (
          <span className="flex items-center">
            <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-opacity-50 border-t-white rounded-full"></div>
            Searching...
          </span>
        ) : (
          "Add"
        )}
      </button>
    </div>
    
    {formParticipants.length > 0 ? (
      <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
        {formParticipants.map((participant, index) => (
          <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded hover:bg-gray-100">
            <span className="text-sm text-gray-800">{participant.email}</span>
            <button
              type="button"
              onClick={() => removeFormParticipant(participant.email)}
              className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-200"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    ) : (
      <div className="p-4 bg-gray-50 rounded-md text-center text-sm text-gray-500">
        No participants added yet. Add participants by email above.
      </div>
    )}
  </div>
)}
              
              {(!eventFormData.isEditing || 
                (eventFormData.isEditing && currentEvent?.type === EventType.TASK)) && 
               eventFormData.type === EventType.TASK && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Priority
                  </label>
                  <div className="flex space-x-2">
                    {Object.values(TaskPriority).map(priority => (
                      <button
                        key={priority}
                        type="button"
                          onClick={() => setEventFormData({ 
                            ...eventFormData, 
                            priority: priority
                          })}
                          className={`px-3 py-1.5 rounded-full text-sm flex items-center ${
                            eventFormData.priority === priority
                              ? priority === TaskPriority.LOW 
                                ? 'bg-blue-100 text-blue-800 border-2 border-blue-400' 
                                : priority === TaskPriority.MEDIUM 
                                  ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-400' 
                                  : 'bg-red-100 text-red-800 border-2 border-red-400'
                              : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                          }`}
                        >
                          {priority === TaskPriority.LOW && <span className="mr-1">🔽</span>}
                          {priority === TaskPriority.MEDIUM && <span className="mr-1">⏺️</span>}
                          {priority === TaskPriority.HIGH && <span className="mr-1">🔼</span>}
                          
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {eventFormData.isEditing && currentEvent?.type === EventType.TASK && (
                  <div className="bg-gray-50 rounded-lg p-3 flex items-center">
                    <input
                      type="checkbox"
                      id="isCompleted"
                      checked={eventFormData.isCompleted || false}
                      onChange={(e) => setEventFormData({ ...eventFormData, isCompleted: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="isCompleted" className="ml-2 block text-sm text-gray-900">
                      Mark as completed
                    </label>
                  </div>
                )}
                
                {!eventFormData.isEditing && (
  <>
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Calendar
      </label>
      <div className="relative">
        <select
          value={eventFormData.calendarId}
          onChange={(e) => {
            const selectedCalendarId = parseInt(e.target.value);
            const selectedCalendar = calendars.find(cal => cal.id === String(selectedCalendarId));
            setEventFormData({ 
              ...eventFormData, 
              calendarId: selectedCalendarId,
              color: selectedCalendar?.color || eventFormData.color
            });
          }}
          className="w-full border border-gray-300 rounded-md px-3 py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none"
        >
          {calendars
            .filter(cal => 
              cal.calendarType !== "holiday" && 
              cal.role?.toLowerCase() !== "viewer"
            )
            .map((cal) => (
              <option key={cal.id} value={cal.id}>
                {cal.title}
              </option>
            ))
          }
        </select>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <div 
            className="w-4 h-4 rounded-full" 
            style={{ backgroundColor: selectedCalendar?.color || eventFormData.color }}
          ></div>
        </div>
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronRight size={16} className="text-gray-400" />
        </div>
      </div>
    </div>
  </>
)}

<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    Event Color
  </label>
  <div className="flex items-center">
    <div className="flex items-center gap-2 flex-wrap mr-3">
      {predefinedColors && predefinedColors.slice(0, 7).map(color => (
        <button
          key={color}
          type="button"
          onClick={() => setEventFormData({ ...eventFormData, color })}
          className={`w-7 h-7 rounded-full transition-all ${
            eventFormData.color === color ? 'ring-2 ring-offset-2 ring-indigo-500' : ''
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
    <input
      type="color"
      value={eventFormData.color}
      onChange={(e) => setEventFormData({ ...eventFormData, color: e.target.value })}
      className="h-9 w-9 border-0 p-0 rounded mr-2"
    />
    <div className="text-xs text-gray-500 flex-1">
      {eventFormData.isEditing 
        ? "Change the event color" 
        : "If not selected, it will be the same as in the calendar"}
    </div>
  </div>
</div>
                  
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
            <button
  type="button"
  onClick={() => {
    setShowEventModal(false);
    resetEventForm();
  }}
  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm"
>
  Cancel
</button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm flex items-center"
              >
                {eventFormData.isEditing ? (
                  <>
                    <Check size={16} className="mr-1" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus size={16} className="mr-1" />
                    Create Event
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

const renderEventDetailModal = () => {
  if (holidayEvent && holidayEvent.type === "holiday") {
    const eventColor = holidayEvent.color || "#FF7043";
    const eventDate = new Date(holidayEvent.start);
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
          <div 
            className="px-6 py-5 relative overflow-hidden"
            style={{ 
              backgroundColor: eventColor,
              color: '#fff'
            }}
          >
            <div className="absolute -right-12 -top-10 w-32 h-32 rounded-full bg-white opacity-10"></div>
            <div className="absolute -right-5 -bottom-20 w-40 h-40 rounded-full bg-white opacity-5"></div>
            
            <div className="flex justify-between items-start relative z-10">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-600">
                    Holiday
                  </span>
                </div>
                
                <h2 className="text-2xl font-bold text-white mb-1 pr-8 break-words">
                  {holidayEvent.title}
                </h2>
                
                <div className="flex items-center text-white/90 text-sm mt-3">
                  <Clock size={16} className="mr-2" />
                  <span>{format(eventDate, "EEEE, MMMM d, yyyy")}</span>
                </div>
              </div>
              
              <button 
                onClick={() => {
                  setShowEventDetailModal(false);
                  setHolidayEvent(null);
                }}
                className="p-1 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={24} className="text-white" />
              </button>
            </div>
          </div>
          
<div className="p-6">
  {holidayEvent.description ? (
    holidayEvent.description.startsWith("Observance") ? (
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
        <p className="text-gray-700">Holiday</p>
      </div>
    ) : (
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
        <p className="text-gray-700 whitespace-pre-line">{holidayEvent.description}</p>
      </div>
    )
  ) : (
    <div className="py-2 px-3 bg-gray-50 rounded-md text-gray-500 text-sm italic">
      No additional information available for this holiday.
    </div>
  )}
</div>
          
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
            <button
              onClick={() => {
                setShowEventDetailModal(false);
                setHolidayEvent(null);
              }}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!currentEvent) return null;
  const calendar = calendars.find(
    cal => cal.id === String(currentEvent.participations?.[0]?.calendarMember?.calendarId)
  );

  const calendarFromParticipation = !calendar && currentEvent.participations && 
    currentEvent.participations.length > 0 ?
    calendars.find(cal => 
      cal.id === String(currentEvent.participations[0]?.calendarMember?.calendarId)
    ) : null;
  
  const eventCalendar = calendar || calendarFromParticipation;
  
  let typeIcon;
  let typeColor;
  let typeBgColor;
  let typeLabel;
  
  switch(currentEvent.type) {
    case EventType.ARRANGEMENT:
      typeIcon = <Calendar className="h-5 w-5" />;
      typeColor = "text-indigo-600";
      typeBgColor = "bg-indigo-50";
      typeLabel = "Arrangement";
      break;
    case EventType.TASK:
      typeIcon = <CheckSquare className="h-5 w-5" />;
      typeColor = "text-emerald-600";
      typeBgColor = "bg-emerald-50";
      typeLabel = "Task";
      break;
    case EventType.REMINDER:
      typeIcon = <Clock className="h-5 w-5" />;
      typeColor = "text-amber-600";
      typeBgColor = "bg-amber-50";
      typeLabel = "Reminder";
      break;
    default:
      typeIcon = <Clock className="h-5 w-5" />;
      typeColor = "text-amber-600";
      typeBgColor = "bg-amber-50";
      typeLabel = "Event";
  }
  
  const startDate = new Date(currentEvent.startedAt);
const endDate = new Date(currentEvent.endedAt);
const formattedStartDate = format(startDate, "EEE, MMM d, yyyy");
const formattedStartTime = format(startDate, "h:mm a");
const formattedEndDate = format(endDate, "EEE, MMM d, yyyy");
const formattedEndTime = format(endDate, "h:mm a");

const isSameDay = format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd");
const isMultiDayEvent = !isSameDay;

// Time display logic
let timeDisplay = '';
if (isSameDay) {
  timeDisplay = `${formattedStartTime} - ${formattedEndTime}, ${formattedStartDate}`;
} else {
  // For multi-day events, show complete date and time information
  timeDisplay = `From ${formattedStartTime}, ${formattedStartDate} to ${formattedEndTime}, ${formattedEndDate}`;
}

// Create date range for header display
const headerDateDisplay = isSameDay
  ? formattedStartDate
  : `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
  
  const eventColor = currentEvent.color || eventCalendar?.color || "#4CAF50";
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        <div 
          className="px-6 py-5 relative overflow-hidden"
          style={{ 
            backgroundColor: eventColor,
            color: '#fff'
          }}
        >
          <div className="absolute -right-12 -top-10 w-32 h-32 rounded-full bg-white opacity-10"></div>
          <div className="absolute -right-5 -bottom-20 w-40 h-40 rounded-full bg-white opacity-5"></div>
          
          <div className="flex justify-between items-start relative z-10">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${typeBgColor} ${typeColor}`}>
                  {typeLabel}
                </span>
                
                <span className="flex items-center space-x-1 text-xs text-white/70">
                  <span className="w-2 h-2 rounded-full bg-white inline-block"></span>
                  <span>{eventCalendar?.title || "Calendar"}</span>
                </span>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-1 pr-8 break-words">
                {currentEvent.name}
              </h2>
              
              <div className="flex items-center text-white/90 text-sm mt-3">
                <Clock size={16} className="mr-2" />
                <span>{timeDisplay}</span>
              </div>
            </div>
            
            <button 
              onClick={() => setShowEventDetailModal(false)}
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={24} className="text-white" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'details' 
                  ? `border-${eventColor.replace('#', '')} text-gray-800` 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              style={{ 
                borderBottomColor: activeTab === 'details' ? eventColor : 'transparent'
              }}
            >
              Details
            </button>
            
            {currentEvent.type === EventType.ARRANGEMENT && (
              <button
                onClick={() => setActiveTab('participants')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center ${
                  activeTab === 'participants' 
                    ? `border-${eventColor.replace('#', '')} text-gray-800` 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                style={{ 
                  borderBottomColor: activeTab === 'participants' ? eventColor : 'transparent'
                }}
              >
                Participants
                {/* {currentEvent.participations && currentEvent.participations.filter(p => p.responseStatus !== null).length > 0 && (
                  <span className="ml-2 bg-gray-100 text-gray-700 rounded-full w-5 h-5 text-xs flex items-center justify-center">
                    {currentEvent.participations.filter(p => p.responseStatus !== null).length}
                  </span>
                )} */}
              </button>
            )}
          </div>
          
          {activeTab === 'details' && (
            <div className="p-6">
              {currentEvent.description ? (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                  <p className="text-gray-700 whitespace-pre-line">{currentEvent.description}</p>
                </div>
              ) : (
                <div className="mb-6 py-2 px-3 bg-gray-50 rounded-md text-gray-500 text-sm italic">
                  No description provided
                </div>
              )}
              {isMultiDayEvent && (
  <div className="mb-4 bg-indigo-50 rounded-md p-3 flex items-center">
    <span className="text-indigo-600 font-medium mr-2">📆 Multi-day event</span>
    <span className="text-sm text-indigo-700">
      {`Duration: ${differenceInDays(endDate, startDate) + 1} days`}
    </span>
  </div>
)}
              
              <div className="space-y-4">
                <div className="flex items-center">
                  <div className="w-8 flex items-center justify-center text-gray-400">
                    {currentEvent.category === EventCategory.HOME ? (
                      <span className="text-lg">🏠</span>
                    ) : (
                      <span className="text-lg">💼</span>
                    )}
                  </div>
                  <div className="ml-3">
                    <div className="text-sm font-medium text-gray-900">Category</div>
                    <div className="text-sm text-gray-500">
                      {currentEvent.category === EventCategory.HOME ? "Home" : "Work"}
                    </div>
                  </div>
                </div>
                
                {currentEvent.type === EventType.TASK && currentEvent.task && (
                  <>
                    <div className="flex items-center">
                      <div className="w-8 flex items-center justify-center text-gray-400">
                        <AlertCircle size={18} />
                      </div>
                      <div className="ml-3 flex items-center">
                        <div className="text-sm font-medium text-gray-900 mr-2">Priority:</div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          currentEvent.task.priority === TaskPriority.LOW 
                            ? 'bg-blue-100 text-blue-800' 
                            : currentEvent.task.priority === TaskPriority.MEDIUM 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {currentEvent.task.priority ? (currentEvent.task.priority.charAt(0).toUpperCase() + currentEvent.task.priority.slice(1)) : "None"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className="w-8 flex items-center justify-center text-gray-400">
                        <CheckSquare size={18} />
                      </div>
                      <div className="ml-3 flex items-center">
                        <div className="text-sm font-medium text-gray-900 mr-2">Status:</div>
                        {canEditEvent ? (
                          <button 
                            onClick={() => {
                              if (currentEvent.id && currentEvent.task) {
                                const updatedTask = {
                                  ...currentEvent.task,
                                  isCompleted: !currentEvent.task.isCompleted
                                };
                                
                                const updatePayload: Partial<UpdateEventPayload> = {
                                  isCompleted: !currentEvent.task.isCompleted
                                };
                                
                                dispatch(updateEvent(currentEvent.id, updatePayload));
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium flex items-center ${
                              currentEvent.task.isCompleted
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {currentEvent.task.isCompleted ? (
                              <>
                                <Check size={14} className="mr-1" />
                                Completed
                              </>
                            ) : 'Mark as completed'}
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            currentEvent.task.isCompleted
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {currentEvent.task.isCompleted ? 'Completed' : 'Incomplete'}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'participants' && currentEvent.type === EventType.ARRANGEMENT && (
  <div className="p-6">
    {canManageParticipants && (
      <button 
        onClick={() => setShowParticipantModal(true)}
        className="w-full mb-4 py-2 px-4 border border-dashed border-gray-300 rounded-lg text-indigo-600 font-medium text-sm hover:bg-indigo-50 transition-colors flex items-center justify-center"
      >
        <UserPlus size={16} className="mr-2" />
        Add participants
      </button>
    )}
    
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-gray-500 mb-3">Participants</h3>
      
      {currentEvent.participations && currentEvent.participations.length > 0 ? (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          {(() => {
            const uniqueParticipants = new Map();
            
            currentEvent.participations
              .filter(participant => participant.responseStatus !== null)
              .forEach(participant => {
                const email = participant.calendarMember?.user?.email;
                const userId = participant.calendarMember?.user?.id;
                
                const key = email || userId;
                
                if (key && !uniqueParticipants.has(key)) {
                  uniqueParticipants.set(key, participant);
                }
              });
            
            return Array.from(uniqueParticipants.values()).map((participant, index, filteredArray) => (
              <div 
                key={participant.id} 
                className={`flex items-center justify-between p-3 ${
                  index < filteredArray.length - 1 ? 'border-b border-gray-200' : ''
                } hover:bg-gray-50`}
              >
                <div className="flex items-center">
                  <img 
                    src={`http://localhost:3000/uploads/avatars/${participant.calendarMember.user.profilePictureName}`}
                    alt="avatar"
                    className="w-8 h-8 rounded-full mr-3"
                  />
                  <div>
                  <div className="flex items-center text-sm font-medium text-gray-900">
                      {participant.calendarMember.user.firstName} {participant.calendarMember.user.lastName}
                      {participant.responseStatus === ResponseStatus.ACCEPTED && (
                    <div className="ml-2 w-4 h-4 rounded-full bg-green-400 flex items-center justify-center border border-white">
                      <Check size={10} className="text-white" />
                    </div>
                  )}
                  {participant.responseStatus === ResponseStatus.DECLINED && (
                    <div className="ml-2 w-4 h-4 rounded-full bg-red-400 flex items-center justify-center border border-white">
                      <X size={10} className="text-white" />
                    </div>
                  )}
                    </div>
                    <div className="text-xs text-gray-500">{participant.calendarMember.user.email}</div>
                  </div>
                </div>
                
                <div className="flex items-center">
                  {/* Status badge */}
                  {/* <span className={`text-xs px-2 py-1 rounded-full ${
                    participant.responseStatus === ResponseStatus.ACCEPTED
                      ? 'bg-green-100 text-green-800'
                      : participant.responseStatus === ResponseStatus.DECLINED
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {participant.responseStatus}
                  </span> */}
                  
                  {participant.calendarMember.userId === authUser?.id && (
                    <div className="flex space-x-1 ml-2">
                      {participant.responseStatus !== ResponseStatus.INVITED && (
                        <>
                          {participant.responseStatus !== ResponseStatus.ACCEPTED && (
                            <button
                              onClick={() => handleUpdateParticipantStatus(
                                participant.calendarMemberId, 
                                ResponseStatus.ACCEPTED
                              )}
                              className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
                              title="Accept"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          
                          {participant.responseStatus !== ResponseStatus.DECLINED && (
                            <button
                              onClick={() => handleUpdateParticipantStatus(
                                participant.calendarMemberId, 
                                ResponseStatus.DECLINED
                              )}
                              className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                              title="Decline"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </>
                      )}
                      
                      <button
                        onClick={() => handleRemoveParticipant(participant.calendarMemberId)}
                        className="p-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        title="Leave event"
                      >
                        <LogOut size={14} />
                      </button>
                    </div>
                  )}
                  
                  {canManageParticipants && 
                    participant.calendarMember.userId !== authUser?.id && (
                    <button
                      onClick={() => handleRemoveParticipant(participant.calendarMemberId)}
                      className="ml-2 p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100"
                      title="Remove participant"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg">
          No participants
        </div>
      )}
    </div>
  </div>
)}
        </div>
        
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between">
  <div>
    {canDeleteEvent && (
      <button
        onClick={handleDeleteEvent}
        className="px-4 py-2 text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors text-sm font-medium flex items-center shadow-sm"
      >
        <Trash2 size={16} className="mr-1" />
        Delete
      </button>
    )}
  </div>
  
  <div className="flex space-x-3">
    <button
      onClick={() => setShowEventDetailModal(false)}
      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm"
    >
      Close
    </button>
    
    {canEditEvent && (
      <button
        onClick={handleEditEvent}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center shadow-sm"
      >
        <Edit2 size={16} className="mr-1" />
        Edit
      </button>
    )}
  </div>
</div>
      </div>
    </div>
  );
};
  const renderParticipantModal = () => {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center">
            <h2 className="text-xl font-bold">Add Participant</h2>
            <button 
              onClick={() => setShowParticipantModal(false)}
              className="text-white hover:text-indigo-100"
            >
              <X size={24} />
            </button>
          </div>
          
          <form onSubmit={handleAddParticipant} className="p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={participantEmail}
                onChange={(e) => setParticipantEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="user@example.com"
                required
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowParticipantModal(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                disabled={isAddingParticipant}
              >
                {isAddingParticipant ? "Adding..." : "Add Participant"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg relative">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center">
            <span className="mr-2 text-indigo-600">
              {currentView === "day" ? "🗓️" : 
               currentView === "week" ? "🗓️" : 
               currentView === "month" ? "🗓️" : "🗓️"}
            </span>
            {(() => {
              switch (currentView) {
                case "month":
                  return format(currentDate, "MMMM yyyy");
                case "week": {
                  const startWeek = startOfWeek(currentDate, { weekStartsOn: 0 });
                  const endWeek = endOfWeek(currentDate, { weekStartsOn: 0 });
                  const weekNumber = getWeek(currentDate, { weekStartsOn: 0 });
                  return (
                    <div className="flex items-center">
                      <div>
                        <div className="text-xl font-bold">
                          Week {weekNumber}, {format(startWeek, "MMM d")} – {format(endWeek, "MMM d, yyyy")}
                        </div>
                      </div>
                    </div>
                  );
                }  
                case "day":
                  return format(currentDate, "EEEE, MMMM d, yyyy");
                case "year":
                  return currentYear.toString();
                default:
                  return "";
              }
            })()}
          </h2>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleToday}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium text-sm"
            >
              Today
            </button>
            <div className="flex border rounded-md overflow-hidden">
              <button
                onClick={handlePrev}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border-r"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={handleNext}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <button
  onClick={() => navigate('/calendar/create-event')}
  className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors font-medium text-sm flex items-center"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
  Add Event
</button>
          </div>
        </div>
        
        <div className="flex justify-center">
          <div className="inline-flex rounded-md shadow-sm bg-slate-100 p-1">
            <button
              onClick={() => setCurrentView("day")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                currentView === "day"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setCurrentView("week")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                currentView === "week"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setCurrentView("month")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                currentView === "month"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setCurrentView("year")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                currentView === "year"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Year
            </button>
          </div>
        </div>
      </div>
      
      {currentView === "month" && weekdaysHeader}

      <div className={`${currentView === "month" ? "space-y-2" : ""}`}>
        {currentView === "month" && monthRows}
        {currentView === "week" && renderWeekView()}
        {currentView === "day" && renderDayView()}
        {currentView === "year" && renderYearView()}
      </div>

      {showEventModal && renderEventModal()}
      {showEventDetailModal && renderEventDetailModal()}
      {showParticipantModal && renderParticipantModal()}
    </div>
  );
};

export default CustomCalendar;

